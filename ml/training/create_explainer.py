"""
Generate SHAP explainer for the credit model.
"""
import os
import pickle
import numpy as np
import pandas as pd

def create_explainer():
    try:
        import shap
    except ImportError:
        print("SHAP not installed, skipping explainer creation")
        return

    model_path = "ml/models/credit_model.pkl"
    if not os.path.exists(model_path):
        print("No credit model found, skipping explainer")
        return

    with open(model_path, "rb") as f:
        model_data = pickle.load(f)

    model = model_data["model"]
    feature_cols = model_data["feature_cols"]

    df = pd.read_csv("ml/data/credit_dataset.csv")
    from sklearn.preprocessing import LabelEncoder
    le = LabelEncoder()
    df["employment_type_encoded"] = le.fit_transform(df["employment_type"])

    X = df[feature_cols].values

    # Use TreeExplainer for XGBoost/LightGBM/RandomForest
    model_type = model_data.get("model_type", "xgboost")
    if model_type in ("xgboost", "lightgbm", "random_forest"):
        explainer = shap.TreeExplainer(model)
    else:
        background = shap.sample(X, 100, random_state=42)
        explainer = shap.KernelExplainer(model.predict_proba, background)

    os.makedirs("ml/models", exist_ok=True)
    with open("ml/models/credit_explainer.pkl", "wb") as f:
        pickle.dump(explainer, f)

    print(f"SHAP explainer saved to ml/models/credit_explainer.pkl")
    print(f"Model type: {model_type}")
    print(f"Feature count: {len(feature_cols)}")


if __name__ == "__main__":
    create_explainer()
