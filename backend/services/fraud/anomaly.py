"""Anomaly scoring via persisted Isolation Forest."""
import os
from typing import Dict

import numpy as np

MODEL_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "..", "ml", "models")

FRAUD_FEATURES = [
    "suspicious_transaction_count",
    "connected_accounts",
    "cashflow_volatility",
    "digital_payment_ratio",
    "transaction_count",
    "avg_transaction",
]


def anomaly_score(features: Dict) -> Dict:
    """Return an anomaly score and metadata from the Isolation Forest artifact.

    If no model artifact exists, returns a score of 0.0 labelled as `no_model`.
    """
    model_path = os.path.join(MODEL_DIR, "fraud_model.pkl")
    if not os.path.exists(model_path):
        return {
            "score": 0.0,
            "model_loaded": False,
            "model_path": model_path,
        }

    try:
        import pickle

        with open(model_path, "rb") as f:
            model_data = pickle.load(f)

        model = model_data["model"]
        X = np.array([[float(features.get(f, 0) or 0) for f in FRAUD_FEATURES]])
        raw_score = model.decision_function(X)[0]
        normalized = 1.0 / (1.0 + np.exp(raw_score))
        return {
            "score": float(normalized),
            "model_loaded": True,
            "model_path": model_path,
        }
    except Exception as exc:  # pragma: no cover - defensive fallback
        return {
            "score": 0.0,
            "model_loaded": False,
            "model_path": model_path,
            "error": str(exc),
        }
