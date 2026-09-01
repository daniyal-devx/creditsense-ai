"""
Train the FraudSense model using Isolation Forest.
"""
import os
import pickle
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest


def train_fraud_model():
    """Train Isolation Forest for fraud detection."""
    df = pd.read_csv("ml/data/credit_dataset.csv")
    print(f"Loaded {len(df)} samples")

    feature_cols = [
        "suspicious_transaction_count",
        "connected_accounts",
        "cashflow_volatility",
        "digital_payment_ratio",
        "transaction_count",
        "avg_transaction",
    ]

    X = df[feature_cols].values

    fraud_rate = df["fraud_flag"].mean()
    print(f"Fraud rate: {fraud_rate:.2%}")

    model = IsolationForest(
        n_estimators=200,
        contamination=fraud_rate,
        max_samples="auto",
        random_state=42,
        n_jobs=-1,
    )

    model.fit(X)

    predictions = model.predict(X)
    anomalies = (predictions == -1).sum()
    print(f"Anomalies detected: {anomalies} / {len(X)} ({anomalies / len(X):.2%})")

    # Check overlap with known fraud flags
    actual_fraud = df["fraud_flag"].values
    detected_fraud = predictions == -1
    overlap = (actual_fraud & detected_fraud).sum()
    total_fraud = actual_fraud.sum()
    print(f"Overlap with known fraud: {overlap} / {total_fraud} ({overlap / total_fraud:.2%})")

    os.makedirs("ml/models", exist_ok=True)
    model_data = {
        "model": model,
        "feature_cols": feature_cols,
    }
    with open("ml/models/fraud_model.pkl", "wb") as f:
        pickle.dump(model_data, f)
    print("Fraud model saved to ml/models/fraud_model.pkl")

    return model


if __name__ == "__main__":
    train_fraud_model()
