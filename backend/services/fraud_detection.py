"""FraudSense — Module 3: rule-based checks + Isolation Forest."""
import os
import pickle
import numpy as np

MODEL_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "ml", "models")

FRAUD_FEATURES = [
    "suspicious_transaction_count",
    "connected_accounts",
    "cashflow_volatility",
    "digital_payment_ratio",
    "transaction_count",
    "avg_transaction",
]


def detect_fraud(features: dict, application) -> dict:
    alerts = []
    fraud_score = 0.0

    if features.get("suspicious_transaction_count", 0) > 3:
        alerts.append({
            "type": "SUSPICIOUS_TRANSACTIONS",
            "severity": "HIGH",
            "description": f"Detected {features['suspicious_transaction_count']} suspicious transactions",
        })
        fraud_score += 0.3

    if features.get("connected_accounts", 0) > 5:
        alerts.append({
            "type": "EXCESSIVE_CONNECTIONS",
            "severity": "MEDIUM",
            "description": f"Account connected to {features['connected_accounts']} other accounts",
        })
        fraud_score += 0.2

    income = features.get("monthly_income", 0)
    avg_txn = features.get("avg_transaction", 0)
    if income > 0 and avg_txn > income * 0.8:
        alerts.append({
            "type": "UNUSUAL_TRANSACTION_SIZE",
            "severity": "MEDIUM",
            "description": "Average transaction size is unusually large relative to income",
        })
        fraud_score += 0.2

    if features.get("cashflow_volatility", 0) > 0.7:
        alerts.append({
            "type": "HIGH_VOLATILITY",
            "severity": "MEDIUM",
            "description": "Cashflow volatility exceeds normal threshold",
        })
        fraud_score += 0.15

    iso_score = _isolation_forest_score(features)
    if iso_score > 0.6:
        alerts.append({
            "type": "ANOMALY_DETECTED",
            "severity": "HIGH" if iso_score > 0.8 else "MEDIUM",
            "description": f"Isolation Forest anomaly score: {iso_score:.2f}",
        })
        fraud_score += iso_score * 0.3

    fraud_score = min(1.0, fraud_score)
    fraud_flag = fraud_score > 0.5 or len([a for a in alerts if a["severity"] == "HIGH"]) > 0

    return {
        "fraud_flag": fraud_flag,
        "fraud_score": round(fraud_score, 3),
        "alerts": alerts,
    }


def _isolation_forest_score(features: dict) -> float:
    model_path = os.path.join(MODEL_DIR, "fraud_model.pkl")
    if not os.path.exists(model_path):
        return 0.0

    with open(model_path, "rb") as f:
        model_data = pickle.load(f)

    model = model_data["model"]
    X = np.array([[float(features.get(f, 0)) for f in FRAUD_FEATURES]])
    raw_score = model.decision_function(X)[0]
    normalized = 1.0 / (1.0 + np.exp(raw_score))
    return float(normalized)
