"""Credit model inference — loads serialized model and predicts."""
import os
import pickle
import numpy as np

MODEL_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "ml", "models")


def _get_model_path():
    return os.path.join(MODEL_DIR, "credit_model.pkl")


FEATURE_ORDER = [
    "age", "employment_months", "monthly_income", "monthly_expenses",
    "existing_debt", "credit_history_months", "income_stability",
    "repayment_history", "late_payment_count", "transaction_count",
    "avg_transaction", "cashflow_volatility", "digital_payment_ratio",
    "account_age_months", "suspicious_transaction_count", "connected_accounts",
    "loan_amount", "loan_term",
]

EMPLOYMENT_MAP = {
    "salaried": 0, "freelancer": 1, "small_shop_owner": 2,
    "online_seller": 3, "driver": 4, "small_business_owner": 5,
    "informal_worker": 6,
}

LABEL_MAP_INVERSE = {0: "LOW", 1: "MEDIUM", 2: "HIGH"}


def _features_to_array(features: dict) -> np.ndarray:
    vals = [float(features.get(f, 0)) for f in FEATURE_ORDER]
    emp = EMPLOYMENT_MAP.get(features.get("employment_type", "informal_worker"), 6)
    vals.append(float(emp))
    return np.array(vals).reshape(1, -1)


def predict_credit(features: dict) -> dict:
    model_path = _get_model_path()
    if not os.path.exists(model_path):
        return _fallback_prediction(features)

    with open(model_path, "rb") as f:
        model_data = pickle.load(f)

    model = model_data["model"]
    X = _features_to_array(features)

    proba_arr = model.predict_proba(X)[0]
    predicted_class = int(model.predict(X)[0])
    risk_level = LABEL_MAP_INVERSE[predicted_class]

    # Convert to score (0-1000)
    # LOW = high score, HIGH = low score
    if predicted_class == 0:  # LOW risk
        score = int(700 + proba_arr[0] * 150)
    elif predicted_class == 1:  # MEDIUM risk
        score = int(500 + proba_arr[1] * 150)
    else:  # HIGH risk
        score = int(300 + proba_arr[2] * 150)

    score = max(0, min(1000, score))
    repayment_prob = proba_arr[0]  # Probability of LOW risk

    if score >= 700:
        risk_level = "LOW"
        decision = "APPROVE"
    elif score >= 500:
        risk_level = "MEDIUM"
        decision = "MANUAL_REVIEW"
    else:
        risk_level = "HIGH"
        decision = "REJECT"

    return {
        "credit_score": score,
        "repayment_probability": round(repayment_prob, 4),
        "risk_level": risk_level,
        "decision": decision,
        "raw_proba": float(proba_arr[predicted_class]),
    }


def _fallback_prediction(features: dict) -> dict:
    """Rule-based fallback when no trained model is available."""
    score = 500
    income = features.get("monthly_income", 0)
    expenses = features.get("monthly_expenses", 0)
    stability = features.get("income_stability", 0.5)
    repayment = features.get("repayment_history", 0.5)
    acct_age = features.get("account_age_months", 0)

    if income > expenses * 1.5:
        score += 100
    if stability > 0.7:
        score += 80
    if repayment > 0.7:
        score += 80
    if acct_age > 12:
        score += 50
    if features.get("late_payment_count", 0) > 2:
        score -= 100
    if features.get("cashflow_volatility", 0) > 0.5:
        score -= 50

    score = max(0, min(1000, score))
    proba = 1 - (score / 1000)

    if score >= 700:
        risk_level, decision = "LOW", "APPROVE"
    elif score >= 500:
        risk_level, decision = "MEDIUM", "MANUAL_REVIEW"
    else:
        risk_level, decision = "HIGH", "REJECT"

    return {
        "credit_score": score,
        "repayment_probability": round(1 - proba, 4),
        "risk_level": risk_level,
        "decision": decision,
        "raw_proba": proba,
    }
