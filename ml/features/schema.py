"""Feature schema shared by training and inference."""
from dataclasses import dataclass
from typing import List


@dataclass(frozen=True)
class FeatureSchema:
    numerical_cols: List[str]
    categorical_cols: List[str]

    @property
    def feature_cols(self) -> List[str]:
        return self.numerical_cols + self.categorical_cols


CREDIT_SCHEMA = FeatureSchema(
    numerical_cols=[
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
    ],
    categorical_cols=["employment_type"],
)


FRAUD_SCHEMA = FeatureSchema(
    numerical_cols=[
        "suspicious_transaction_count",
        "connected_accounts",
        "cashflow_volatility",
        "digital_payment_ratio",
        "transaction_count",
        "avg_transaction",
    ],
    categorical_cols=[],
)
