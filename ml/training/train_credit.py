"""Train the calibrated CreditSense credit-risk model.

Pipeline: ColumnTransformer + OrdinalEncoder + XGBClassifier, calibrated with
CalibratedClassifierCV(isotonic). Artifacts are serialized with joblib and
include the preprocessor so training and inference encode categoricals identically.
"""
import hashlib
import json
from datetime import datetime, timezone

import joblib
import numpy as np
import pandas as pd
import shap
from sklearn.calibration import CalibratedClassifierCV
from sklearn.frozen import FrozenEstimator
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import GridSearchCV, StratifiedKFold, train_test_split
from sklearn.pipeline import Pipeline
from xgboost import XGBClassifier

from ml.config import (
    CREDIT_EXPLAINER_PATH,
    CREDIT_METRICS_PATH,
    CREDIT_MODEL_PATH,
    DATASET_PATH,
    RANDOM_SEED,
    TEST_SIZE,
    VAL_SIZE,
)
from ml.features.build import _DataFrameWrapper, build_X, make_preprocessor
from ml.features.schema import CREDIT_SCHEMA
from ml.training.evaluate import calibration_data, evaluate_credit_model, write_metrics

RANDOM_STATE = RANDOM_SEED


def load_dataset(path: str = DATASET_PATH) -> pd.DataFrame:
    if not path.exists():
        raise FileNotFoundError(
            f"Dataset not found at {path}. Generate it first with "
            "'python -m ml.training.generate_dataset'"
        )
    df = pd.read_csv(path)
    required = set(CREDIT_SCHEMA.feature_cols) | {"default"}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"Dataset missing required columns: {sorted(missing)}")
    return df


def _build_base_pipeline():
    """Return an unfitted sklearn Pipeline(wrapper -> preprocessor -> xgb)."""
    df_wrapper = _DataFrameWrapper(CREDIT_SCHEMA.feature_cols)
    preprocessor = make_preprocessor(CREDIT_SCHEMA)
    xgb = XGBClassifier(
        objective="binary:logistic",
        eval_metric="logloss",
        n_estimators=150,
        max_depth=4,
        learning_rate=0.08,
        subsample=0.85,
        colsample_bytree=0.85,
        reg_lambda=1.0,
        reg_alpha=0.1,
        min_child_weight=3,
        gamma=0.1,
        random_state=RANDOM_STATE,
        n_jobs=1,  # determinism over speed for reproducible artifacts
    )
    return Pipeline(
        steps=[("df_wrapper", df_wrapper), ("preprocessor", preprocessor), ("xgb", xgb)],
    )


def _train_with_grid_search(X_train: pd.DataFrame, y_train: np.ndarray):
    """Run a small 5-fold grid search and return the best estimator + CV score.

    The returned estimator is later calibrated on a held-out set.
    """
    pipe = _build_base_pipeline()
    param_grid = {
        "xgb__max_depth": [3, 5],
        "xgb__learning_rate": [0.05, 0.1],
    }
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=RANDOM_STATE)
    search = GridSearchCV(
        pipe,
        param_grid,
        scoring="roc_auc",
        cv=cv,
        n_jobs=-1,
        refit=True,
    )
    search.fit(X_train, y_train)
    print(f"Best CV ROC-AUC: {search.best_score_:.4f}")
    print(f"Best params: {search.best_params_}")
    return search.best_estimator_, float(search.best_score_)


def _calibrate(base_estimator, X_cal: np.ndarray, y_cal: np.ndarray):
    """Calibrate probabilities with isotonic regression on a validation fold.

    sklearn 1.8+ removed the `cv='prefit'` string; a prefit estimator must be
    wrapped in FrozenEstimator so that all provided data is used for calibration.
    """
    calibrated = CalibratedClassifierCV(
        estimator=FrozenEstimator(base_estimator),
        method="isotonic",
        cv=None,
        n_jobs=1,
    )
    calibrated.fit(X_cal, y_cal)
    return calibrated


def _extract_employment_categories(preprocessor) -> list:
    """Return the ordered employment categories learned by the preprocessor."""
    cat_encoder = preprocessor.named_transformers_["cat"]
    return [str(c) for c in cat_encoder.categories_[0]]


def _build_explainer(calibrated_model, X_background: np.ndarray):
    """Build a SHAP TreeExplainer on the underlying XGBoost booster.

    The calibrated classifier wraps a FrozenEstimator around the fitted pipeline.
    We unwrap it to reach the XGBoost step.
    """
    calibrated_clf = calibrated_model.calibrated_classifiers_[0]
    frozen_estimator = calibrated_clf.estimator
    base_pipeline = frozen_estimator.estimator
    xgb_step = base_pipeline.named_steps["xgb"]

    # Use a small background sample for dependence; TreeExplainer does not strictly
    # need it, but keeping it makes summary/interaction plots consistent later.
    background = shap.sample(pd.DataFrame(X_background), min(100, len(X_background)), random_state=RANDOM_STATE)
    explainer = shap.TreeExplainer(xgb_step, data=background.to_numpy())
    return explainer


def train_credit_model():
    """Train, calibrate, evaluate, and persist the credit model."""
    df = load_dataset()
    print(f"Loaded {len(df)} samples")
    print(f"Default rate: {df['default'].mean():.2%}")

    X_full = df[CREDIT_SCHEMA.feature_cols]
    y_full = df["default"].astype(int).values

    # 60/20/20 split
    X_trainval, X_test, y_trainval, y_test = train_test_split(
        X_full,
        y_full,
        test_size=TEST_SIZE,
        random_state=RANDOM_STATE,
        stratify=y_full,
    )
    X_train, X_val, y_train, y_val = train_test_split(
        X_trainval,
        y_trainval,
        test_size=VAL_SIZE,
        random_state=RANDOM_STATE,
        stratify=y_trainval,
    )

    print(f"Train: {len(y_train)} | Val: {len(y_val)} | Test: {len(y_test)}")

    base_estimator, cv_roc_auc = _train_with_grid_search(X_train, y_train)
    calibrated_model = _calibrate(base_estimator, X_val.values, y_val)

    # Unwrap the FrozenEstimator to reach the fitted pipeline and preprocessor.
    frozen_estimator = calibrated_model.calibrated_classifiers_[0].estimator
    fitted_pipeline = frozen_estimator.estimator
    preprocessor = fitted_pipeline.named_steps["preprocessor"]

    # Evaluation on test set
    X_test_transformed = preprocessor.transform(X_test)
    y_prob = calibrated_model.predict_proba(X_test)[:, 1]
    y_pred = (y_prob >= 0.5).astype(int)

    val_prob = calibrated_model.predict_proba(X_val)[:, 1]
    val_roc_auc = roc_auc_score(y_val, val_prob)

    metrics = evaluate_credit_model(
        y_true=y_test,
        y_prob=y_prob,
        y_pred=y_pred,
        model_type="xgboost_calibrated",
        dataset_rows=len(df),
    )
    metrics["train_rows"] = len(y_train)
    metrics["val_rows"] = len(y_val)
    metrics["test_rows"] = len(y_test)
    metrics["calibration"] = calibration_data(y_test, y_prob, n_bins=10)
    metrics["cv_roc_auc_mean"] = round(cv_roc_auc, 6)
    metrics["val_roc_auc"] = round(val_roc_auc, 6)
    metrics["feature_cols"] = CREDIT_SCHEMA.feature_cols
    metrics["categorical_cols"] = CREDIT_SCHEMA.categorical_cols
    metrics["generated_at"] = datetime.now(timezone.utc).isoformat()

    # Persist metrics
    write_metrics(metrics, CREDIT_METRICS_PATH)
    print(f"Metrics written to {CREDIT_METRICS_PATH}")
    print(f"Test ROC-AUC: {metrics['roc_auc']:.4f} | PR-AUC: {metrics['pr_auc']:.4f}")

    # Build and persist explainer
    explainer = _build_explainer(calibrated_model, X_test_transformed)
    explainer_artifact = {
        "explainer": explainer,
        "preprocessor": preprocessor,
        "feature_names": list(preprocessor.get_feature_names_out()),
        "model_version": "v3",
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
    joblib.dump(explainer_artifact, CREDIT_EXPLAINER_PATH)
    print(f"Explainer saved to {CREDIT_EXPLAINER_PATH}")

    # Persist main model artifact
    employment_categories = _extract_employment_categories(preprocessor)
    artifact = {
        "model": calibrated_model,
        "preprocessor": preprocessor,
        "feature_cols": CREDIT_SCHEMA.feature_cols,
        "categorical_cols": CREDIT_SCHEMA.categorical_cols,
        "employment_categories": employment_categories,
        "label_map": {"DEFAULT": 1, "REPAID": 0},
        "model_version": "v3",
        "metrics_path": str(CREDIT_METRICS_PATH),
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
    joblib.dump(artifact, CREDIT_MODEL_PATH)

    # Update manifest with sha256
    sha256 = hashlib.sha256(CREDIT_MODEL_PATH.read_bytes()).hexdigest()
    manifest_path = CREDIT_MODEL_PATH.parent / "MANIFEST.json"
    manifest = {
        "model_version": "v3",
        "artifact": CREDIT_MODEL_PATH.name,
        "artifact_sha256": sha256,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "note": "Canonical credit scoring artifact. Regenerate with python -m ml.training.train_credit",
    }
    manifest_path.write_text(json.dumps(manifest, indent=2))

    print(f"Credit model saved to {CREDIT_MODEL_PATH}")
    print(f"Artifact SHA256: {sha256}")
    return artifact, metrics


if __name__ == "__main__":
    train_credit_model()
