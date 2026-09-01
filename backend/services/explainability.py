"""Explainability service — SHAP-based risk factor explanations."""
import os
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from ml.config import CREDIT_EXPLAINER_PATH

FEATURE_LABELS = {
    "age": "Customer age",
    "employment_months": "Employment tenure",
    "employment_type": "Employment type",
    "monthly_income": "Monthly income level",
    "monthly_expenses": "Monthly expenses",
    "existing_debt": "Existing debt burden",
    "credit_history_months": "Credit history length",
    "income_stability": "Income consistency",
    "repayment_history": "Repayment track record",
    "late_payment_count": "Late payment frequency",
    "transaction_count": "Transaction activity level",
    "avg_transaction": "Average transaction size",
    "cashflow_volatility": "Cashflow stability",
    "digital_payment_ratio": "Digital payment adoption",
    "account_age_months": "Account history length",
    "suspicious_transaction_count": "Suspicious transaction count",
    "connected_accounts": "Connected account count",
    "loan_amount": "Requested loan amount",
    "loan_term": "Loan tenure",
}


def _load_explainer_artifact(path: Path = CREDIT_EXPLAINER_PATH):
    if not path.exists():
        raise FileNotFoundError(f"SHAP explainer artifact not found at {path}")
    return joblib.load(path)


def _shap_values_for_default(explainer, X_transformed: np.ndarray) -> np.ndarray:
    """Return SHAP values for the positive (default) class.

    shap.TreeExplainer can return either a single array (binary positive class)
    or a list of arrays (one per class). We always return the default-class values.
    """
    shap_out = explainer.shap_values(X_transformed)
    if isinstance(shap_out, list):
        # Index 1 corresponds to the positive class for binary classification.
        sv = np.asarray(shap_out[1])
    elif hasattr(shap_out, "values"):
        sv = np.asarray(shap_out.values)
    else:
        sv = np.asarray(shap_out)

    # If the explainer returned values for both classes with shape (2, n_samples, n_features),
    # select the positive class.
    if sv.ndim == 3 and sv.shape[0] == 2:
        sv = sv[1]
    return sv


def _shap_explanation(features: dict) -> dict:
    artifact = _load_explainer_artifact()
    explainer = artifact["explainer"]
    preprocessor = artifact["preprocessor"]
    feature_names = list(artifact.get("feature_names", preprocessor.get_feature_names_out()))

    # Build DataFrame with the exact column order the preprocessor expects.
    feature_cols = list(preprocessor.feature_names_in_) if hasattr(preprocessor, "feature_names_in_") else feature_names
    row = {col: features.get(col, 0) for col in feature_cols}
    X = pd.DataFrame([row], columns=feature_cols)
    X_transformed = preprocessor.transform(X)

    sv = _shap_values_for_default(explainer, X_transformed)[0]

    factors = []
    for i, feat in enumerate(feature_names):
        if i >= len(sv):
            break
        val = float(sv[i])
        if abs(val) < 1e-6:
            continue

        label = FEATURE_LABELS.get(feat, feat.replace("_", " ").title())

        # Positive SHAP value pushes toward default (negative for the applicant).
        # Negative SHAP value pushes away from default (positive for the applicant).
        if val > 0:
            factors.append({"factor": f"Increased {label.lower()}", "direction": "negative", "weight": abs(val)})
        else:
            factors.append({"factor": f"Strong {label.lower()}", "direction": "positive", "weight": abs(val)})

    factors.sort(key=lambda x: x["weight"], reverse=True)
    return {"factors": factors[:8], "method": "shap"}


def _rule_based_explanation(features: dict) -> dict:
    """Deterministic fallback when SHAP artifacts are missing or fail."""
    factors = []

    if features.get("monthly_income", 0) > features.get("monthly_expenses", 0) * 1.3:
        factors.append({"factor": "Stable monthly income", "direction": "positive", "weight": 0.3})

    if features.get("income_stability", 0) > 0.7:
        factors.append({"factor": "Consistent income pattern", "direction": "positive", "weight": 0.25})

    if features.get("repayment_history", 0) > 0.7:
        factors.append({"factor": "Positive repayment history", "direction": "positive", "weight": 0.25})

    if features.get("account_age_months", 0) > 12:
        factors.append({"factor": "Established account history", "direction": "positive", "weight": 0.2})

    if features.get("transaction_count", 0) > 20:
        factors.append({"factor": "Consistent transaction activity", "direction": "positive", "weight": 0.2})

    if features.get("digital_payment_ratio", 0) > 0.5:
        factors.append({"factor": "Strong digital payment adoption", "direction": "positive", "weight": 0.15})

    if features.get("existing_debt", 0) < features.get("monthly_income", 1) * 0.3:
        factors.append({"factor": "Low debt burden", "direction": "positive", "weight": 0.15})

    if features.get("cashflow_volatility", 0) > 0.5:
        factors.append({"factor": "Increased income volatility", "direction": "negative", "weight": 0.25})

    if features.get("late_payment_count", 0) > 2:
        factors.append({"factor": "History of late payments", "direction": "negative", "weight": 0.3})

    if features.get("existing_debt", 0) > features.get("monthly_income", 1) * 0.5:
        factors.append({"factor": "High existing debt burden", "direction": "negative", "weight": 0.25})

    if features.get("suspicious_transaction_count", 0) > 2:
        factors.append({"factor": "Unusual transaction patterns detected", "direction": "negative", "weight": 0.2})

    if features.get("account_age_months", 0) < 6:
        factors.append({"factor": "Limited account history", "direction": "negative", "weight": 0.15})

    return {"factors": factors[:8], "method": "rule_based"}


def generate_explanation(features: dict, credit_result: dict = None) -> dict:
    """Generate SHAP-based explanation, falling back to rule-based if SHAP fails."""
    try:
        return _shap_explanation(features)
    except Exception:
        return _rule_based_explanation(features)
