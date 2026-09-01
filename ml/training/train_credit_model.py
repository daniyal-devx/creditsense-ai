"""
Train the CreditSense scoring model using XGBoost.
"""
import os
import pickle
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, accuracy_score
from sklearn.preprocessing import LabelEncoder

# Try XGBoost first, fall back to LightGBM, then RandomForest
try:
    from xgboost import XGBClassifier
    MODEL_TYPE = "xgboost"
except ImportError:
    try:
        from lightgbm import LGBMClassifier
        MODEL_TYPE = "lightgbm"
    except ImportError:
        from sklearn.ensemble import RandomForestClassifier
        MODEL_TYPE = "random_forest"


FEATURE_COLS = [
    "age",
    "employment_months",
    "monthly_income",
    "monthly_expenses",
    "existing_debt",
    "credit_history_months",
    "income_stability",
    "repayment_history",
    "late_payment_count",
    "transaction_count",
    "avg_transaction",
    "cashflow_volatility",
    "digital_payment_ratio",
    "account_age_months",
    "suspicious_transaction_count",
    "connected_accounts",
    "loan_amount",
    "loan_term",
]


def train_model():
    """Train credit scoring model."""
    print(f"Using model type: {MODEL_TYPE}")

    # Load dataset
    df = pd.read_csv("ml/data/credit_dataset.csv")
    print(f"Loaded {len(df)} samples")

    # Encode employment_type
    le = LabelEncoder()
    df["employment_type_encoded"] = le.fit_transform(df["employment_type"])
    feature_cols = FEATURE_COLS + ["employment_type_encoded"]

    # Encode labels
    label_map = {"LOW": 0, "MEDIUM": 1, "HIGH": 2}
    df["label_encoded"] = df["label"].map(label_map)

    X = df[feature_cols].values
    y = df["label_encoded"].values

    # Split
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    # Train model
    if MODEL_TYPE == "xgboost":
        model = XGBClassifier(
            n_estimators=200,
            max_depth=6,
            learning_rate=0.1,
            subsample=0.8,
            colsample_bytree=0.8,
            random_state=42,
            use_label_encoder=False,
            eval_metric="mlogloss",
        )
    elif MODEL_TYPE == "lightgbm":
        model = LGBMClassifier(
            n_estimators=200,
            max_depth=6,
            learning_rate=0.1,
            random_state=42,
            verbose=-1,
        )
    else:
        model = RandomForestClassifier(
            n_estimators=200,
            max_depth=10,
            random_state=42,
            n_jobs=-1,
        )

    model.fit(X_train, y_train)

    # Evaluate
    y_pred = model.predict(X_test)
    accuracy = accuracy_score(y_test, y_pred)
    print(f"\nAccuracy: {accuracy:.4f}")
    print("\nClassification Report:")
    print(classification_report(
        y_test, y_pred,
        target_names=["LOW", "MEDIUM", "HIGH"],
    ))

    # Feature importance
    if hasattr(model, "feature_importances_"):
        importances = model.feature_importances_
        indices = np.argsort(importances)[::-1]
        print("\nTop 10 Features:")
        for i in range(min(10, len(indices))):
            print(f"  {feature_cols[indices[i]]}: {importances[indices[i]]:.4f}")

    # Save model
    os.makedirs("ml/models", exist_ok=True)
    model_data = {
        "model": model,
        "label_encoder": le,
        "employment_categories": list(le.classes_),
        "feature_cols": feature_cols,
        "label_map": label_map,
        "model_type": MODEL_TYPE,
        "model_version": "v2",
    }
    with open("ml/models/credit_model.pkl", "wb") as f:
        pickle.dump(model_data, f)
    print("\nModel saved to ml/models/credit_model.pkl")
    print(f"Employment categories: {le.classes_}")

    return model, accuracy


if __name__ == "__main__":
    train_model()
