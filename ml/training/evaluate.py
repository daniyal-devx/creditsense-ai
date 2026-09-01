"""Model evaluation helpers and metric writers."""
import json
from pathlib import Path
from typing import Dict, List

import numpy as np
import pandas as pd
from sklearn.metrics import (
    accuracy_score,
    brier_score_loss,
    confusion_matrix,
    f1_score,
    log_loss,
    precision_score,
    recall_score,
    roc_auc_score,
    average_precision_score,
)


def _ks_statistic(y_true: np.ndarray, y_prob: np.ndarray) -> float:
    """Kolmogorov-Smirnov statistic for binary probability scores."""
    pos = y_prob[y_true == 1]
    neg = y_prob[y_true == 0]
    if len(pos) == 0 or len(neg) == 0:
        return 0.0
    values = np.sort(np.unique(np.concatenate([pos, neg])))
    pos_cdf = np.searchsorted(np.sort(pos), values, side="right") / len(pos)
    neg_cdf = np.searchsorted(np.sort(neg), values, side="right") / len(neg)
    return float(np.max(np.abs(pos_cdf - neg_cdf)))


def evaluate_credit_model(
    y_true: np.ndarray,
    y_prob: np.ndarray,
    y_pred: np.ndarray,
    model_type: str,
    dataset_rows: int,
) -> Dict:
    """Compute classification and calibration metrics for the binary default model."""
    y_true = np.asarray(y_true)
    y_prob = np.asarray(y_prob)
    y_pred = np.asarray(y_pred)

    cm = confusion_matrix(y_true, y_pred).tolist()
    tn, fp, fn, tp = cm[0][0], cm[0][1], cm[1][0], cm[1][1]

    metrics = {
        "model_type": model_type,
        "dataset_rows": dataset_rows,
        "roc_auc": round(roc_auc_score(y_true, y_prob), 6),
        "pr_auc": round(average_precision_score(y_true, y_prob), 6),
        "accuracy": round(accuracy_score(y_true, y_pred), 6),
        "precision": round(precision_score(y_true, y_pred, zero_division=0), 6),
        "recall": round(recall_score(y_true, y_pred, zero_division=0), 6),
        "f1": round(f1_score(y_true, y_pred, zero_division=0), 6),
        "brier_score": round(brier_score_loss(y_true, y_prob), 6),
        "log_loss": round(log_loss(y_true, y_prob), 6),
        "ks_statistic": round(_ks_statistic(y_true, y_prob), 6),
        "confusion_matrix": {
            "true_negatives": tn,
            "false_positives": fp,
            "false_negatives": fn,
            "true_positives": tp,
        },
    }
    return metrics


def write_metrics(metrics: Dict, path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        json.dump(metrics, f, indent=2)


def calibration_data(y_true: np.ndarray, y_prob: np.ndarray, n_bins: int = 10) -> List[Dict]:
    """Return mean predicted probability and observed default rate per bin."""
    df = pd.DataFrame({"y_true": y_true, "y_prob": y_prob})
    df["bin"] = pd.qcut(df["y_prob"], q=n_bins, duplicates="drop")
    summary = []
    for interval, group in df.groupby("bin", observed=False):
        count = int(len(group))
        if count == 0:
            continue
        summary.append({
            "bin": str(interval),
            "mean_predicted": round(float(group["y_prob"].mean()), 4),
            "observed_rate": round(float(group["y_true"].mean()), 4),
            "count": count,
        })
    return summary
