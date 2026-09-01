"""Credit model inference — loads serialized model and predicts."""
import json
import os
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from backend.services.scoring import band_and_decision, score_from_p_default

MODEL_DIR = Path(__file__).resolve().parent.parent.parent / "ml" / "models"
MODEL_PATH = MODEL_DIR / "credit_model.joblib"
FALLBACK_MODEL_PATH = MODEL_DIR / "credit_model.pkl"


def _load_artifact(path: Path = MODEL_PATH) -> dict:
    if not path.exists():
        raise FileNotFoundError(
            f"Credit model artifact not found at {path}. "
            "Run 'python -m ml.training.train_credit' to train one."
        )
    return joblib.load(path)


def _ensure_dataframe(features: dict, feature_cols: list[str]) -> pd.DataFrame:
    """Build a single-row DataFrame with the exact column order the model expects."""
    row = {col: features.get(col, 0) for col in feature_cols}
    return pd.DataFrame([row], columns=feature_cols)


def _employment_categories(artifact: dict) -> list[str]:
    """Return ordered employment categories from the artifact."""
    categories = artifact.get("employment_categories")
    if categories is None:
        encoder = artifact.get("label_encoder")
        if encoder is None:
            raise ValueError(
                "Model artifact is missing employment category information. "
                "Retrain the model to produce a compatible artifact."
            )
        categories = list(encoder.classes_)
        artifact["employment_categories"] = categories
    return categories


def _encode_employment(artifact: dict, employment_type: str) -> int:
    """Return the integer encoding for an employment type from the artifact."""
    categories = _employment_categories(artifact)
    if employment_type not in categories:
        raise ValueError(
            f"Unknown employment_type {employment_type!r}. "
            f"Known categories: {categories}"
        )
    return categories.index(employment_type)


def predict_credit(features: dict) -> dict:
    """Predict credit risk from a feature dictionary.

    Raises:
        FileNotFoundError: if the trained model artifact is missing.
        ValueError: if the feature dictionary contains an unknown employment type
            or the artifact is incompatible.
    """
    artifact = _load_artifact(MODEL_PATH)
    model = artifact["model"]
    feature_cols = artifact.get("feature_cols")
    if not feature_cols:
        raise ValueError("Model artifact is missing feature_cols. Retrain the model.")

    employment_type = features.get("employment_type")
    if employment_type is not None:
        categories = _employment_categories(artifact)
        if employment_type not in categories:
            raise ValueError(
                f"Unknown employment_type {employment_type!r}. "
                f"Known categories: {categories}"
            )

    X = _ensure_dataframe(features, feature_cols)
    proba = model.predict_proba(X)[0]

    # Binary default model: class 1 = DEFAULT, class 0 = REPAID
    label_map = artifact.get("label_map", {"DEFAULT": 1, "REPAID": 0})
    p_default = float(proba[label_map["DEFAULT"]])
    p_repaid = float(proba[label_map["REPAID"]])

    score = score_from_p_default(p_default)
    risk_level, decision = band_and_decision(score)

    return {
        "credit_score": score,
        "repayment_probability": round(p_repaid, 4),
        "risk_level": risk_level,
        "decision": decision,
        "p_default": round(p_default, 6),
        "raw_proba": {
            "DEFAULT": round(p_default, 4),
            "REPAID": round(p_repaid, 4),
        },
        "model_version": artifact.get("model_version", "unknown"),
    }


def get_model_metrics() -> dict:
    """Load the persisted credit model metrics."""
    artifact = _load_artifact(MODEL_PATH)
    metrics_path = artifact.get("metrics_path")
    if not metrics_path or not Path(metrics_path).exists():
        return {"detail": "Metrics not found for this artifact"}
    with open(metrics_path, "r") as f:
        return json.load(f)


def artifact_info() -> dict:
    """Return version and hash metadata for the loaded credit artifact."""
    import hashlib

    info = {
        "model_path": str(MODEL_PATH),
        "model_version": None,
        "artifact_sha256": None,
        "artifact_exists": MODEL_PATH.exists(),
    }
    if info["artifact_exists"]:
        try:
            artifact = _load_artifact(MODEL_PATH)
            info["model_version"] = artifact.get("model_version", "unknown")
        except Exception:
            pass
        try:
            info["artifact_sha256"] = hashlib.sha256(MODEL_PATH.read_bytes()).hexdigest()
        except Exception:
            pass
    return info
