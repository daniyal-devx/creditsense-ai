"""Central configuration for the CreditSense ML pipeline."""
import os
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

DATA_DIR = REPO_ROOT / "ml" / "data"
MODELS_DIR = REPO_ROOT / "ml" / "models"
REPORTS_DIR = REPO_ROOT / "ml" / "reports"

DATASET_PATH = DATA_DIR / "credit_dataset.csv"
CREDIT_MODEL_PATH = MODELS_DIR / "credit_model.joblib"
CREDIT_EXPLAINER_PATH = MODELS_DIR / "credit_explainer.joblib"
FRAUD_MODEL_PATH = MODELS_DIR / "fraud_model.joblib"
CREDIT_METRICS_PATH = REPORTS_DIR / "credit_metrics.json"
FRAUD_METRICS_PATH = REPORTS_DIR / "fraud_metrics.json"

RANDOM_SEED = 42
TEST_SIZE = 0.2
VAL_SIZE = 0.25  # of train+val after removing test -> 60/20/20 split

CREDIT_FEATURE_COLS = [
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

CATEGORICAL_COLS = ["employment_type"]

FRAUD_FEATURE_COLS = [
    "suspicious_transaction_count",
    "connected_accounts",
    "cashflow_volatility",
    "digital_payment_ratio",
    "transaction_count",
    "avg_transaction",
]

for d in (DATA_DIR, MODELS_DIR, REPORTS_DIR):
    d.mkdir(parents=True, exist_ok=True)
