"""Explainability service — Module 5: SHAP-based explanations."""
import os
import numpy as np

MODEL_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "ml", "models")

FEATURE_LABELS = {
    "monthly_income": "Monthly income level",
    "monthly_expenses": "Monthly expenses",
    "existing_debt": "Existing debt burden",
    "transaction_count": "Transaction activity level",
    "avg_transaction": "Average transaction size",
    "cashflow_volatility": "Cashflow stability",
    "digital_payment_ratio": "Digital payment adoption",
    "account_age_months": "Account history length",
    "income_stability": "Income consistency",
    "repayment_history": "Repayment track record",
    "late_payment_count": "Late payment frequency",
    "suspicious_transaction_count": "Suspicious transaction count",
    "connected_accounts": "Connected account count",
    "merchant_count": "Merchant relationship count",
    "age": "Customer age",
    "loan_amount": "Requested loan amount",
    "loan_term": "Loan tenure",
    "employment_type": "Employment type",
}

POSITIVE_TEMPLATES = {
    "monthly_income": "Stable monthly income",
    "income_stability": "Consistent income pattern",
    "repayment_history": "Positive repayment history",
    "account_age_months": "Established account history",
    "transaction_count": "Consistent transaction activity",
    "digital_payment_ratio": "Strong digital payment adoption",
    "low_existing_debt": "Low debt burden",
    "cashflow_volatility_low": "Stable cashflow pattern",
}

NEGATIVE_TEMPLATES = {
    "cashflow_volatility": "Increased income volatility",
    "late_payment_count": "History of late payments",
    "existing_debt": "High existing debt burden",
    "suspicious_transaction_count": "Unusual transaction patterns detected",
    "income_stability_low": "Irregular income pattern",
    "account_age_months": "Limited account history",
    "connected_accounts": "Multiple connected accounts",
}


def generate_explanation(features: dict, credit_result: dict) -> dict:
    # Use rule-based explanation for stability
    # SHAP path can be re-enabled after debugging multi-class output handling
    return _rule_based_explanation(features, credit_result)


def _shap_explanation(features: dict, explainer_path: str, model_path: str) -> dict:
    import pickle

    try:
        with open(explainer_path, "rb") as f:
            explainer = pickle.load(f)
    except Exception:
        return _rule_based_explanation(features, {})

    from backend.services.credit_model import _features_to_array, FEATURE_ORDER, EMPLOYMENT_MAP

    try:
        X = _features_to_array(features)
        shap_values = explainer.shap_values(X)

        # Handle multi-class: shap_values is a list of arrays, one per class
        if isinstance(shap_values, list):
            # Use the first class (LOW risk) SHAP values for explanation
            sv = np.array(shap_values[0][0])
        elif hasattr(shap_values, 'values'):
            # TreeExplainer may return Explanation object
            sv = np.array(shap_values.values[0])
        else:
            sv = np.array(shap_values[0])
    except Exception:
        return _rule_based_explanation(features, {})

    all_features = FEATURE_ORDER + ["employment_type_encoded"]
    factors = []

    for i, feat in enumerate(all_features):
        if i >= len(sv):
            break
        val = float(sv[i])
        label = FEATURE_LABELS.get(feat, feat.replace("_", " ").title())

        if abs(val) < 0.01:
            continue

        if feat == "existing_debt" and val < 0:
            factors.append({"factor": "Low debt burden", "direction": "positive", "weight": abs(val)})
        elif feat == "existing_debt" and val > 0:
            factors.append({"factor": "High existing debt burden", "direction": "negative", "weight": abs(val)})
        elif feat == "cashflow_volatility" and val < 0:
            factors.append({"factor": "Stable cashflow pattern", "direction": "positive", "weight": abs(val)})
        elif feat == "cashflow_volatility" and val > 0:
            factors.append({"factor": "Increased income volatility", "direction": "negative", "weight": abs(val)})
        elif val > 0:
            factors.append({"factor": f"Strong {label.lower()}", "direction": "positive", "weight": abs(val)})
        else:
            factors.append({"factor": f"Weak {label.lower()}", "direction": "negative", "weight": abs(val)})

    factors.sort(key=lambda x: x["weight"], reverse=True)

    return {"factors": factors[:8]}


def _rule_based_explanation(features: dict, credit_result: dict) -> dict:
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

    return {"factors": factors[:8]}
