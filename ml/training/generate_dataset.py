"""
Synthetic dataset generator for CreditSense AI.

Generates a persona-correlated latent probability of default and a binary
`default` label. The latent probability is retained in the dataset for
calibration and evaluation but is NOT exposed to the model at train time.
"""
import random
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from typing import Dict, List

from ml.config import DATASET_PATH, RANDOM_SEED

rng = np.random.default_rng(RANDOM_SEED)
random.seed(RANDOM_SEED)

PERSONAS = {
    "salaried": {
        "income_range": (60000, 150000),
        "income_stability_mean": 0.85,
        "employment_months": (24, 120),
        "age_range": (25, 55),
        "credit_history_months": (24, 120),
        "digital_payment_ratio_mean": 0.75,
        "base_default_logit": -1.6,
    },
    "freelancer": {
        "income_range": (40000, 120000),
        "income_stability_mean": 0.55,
        "employment_months": (6, 60),
        "age_range": (22, 45),
        "credit_history_months": (6, 60),
        "digital_payment_ratio_mean": 0.75,
        "base_default_logit": -0.3,
    },
    "small_shop_owner": {
        "income_range": (35000, 90000),
        "income_stability_mean": 0.65,
        "employment_months": (12, 96),
        "age_range": (28, 60),
        "credit_history_months": (12, 96),
        "digital_payment_ratio_mean": 0.40,
        "base_default_logit": -0.7,
    },
    "online_seller": {
        "income_range": (30000, 100000),
        "income_stability_mean": 0.55,
        "employment_months": (3, 48),
        "age_range": (20, 40),
        "credit_history_months": (3, 48),
        "digital_payment_ratio_mean": 0.90,
        "base_default_logit": -0.2,
    },
    "driver": {
        "income_range": (25000, 60000),
        "income_stability_mean": 0.60,
        "employment_months": (6, 60),
        "age_range": (22, 50),
        "credit_history_months": (3, 48),
        "digital_payment_ratio_mean": 0.55,
        "base_default_logit": -0.5,
    },
    "small_business_owner": {
        "income_range": (50000, 200000),
        "income_stability_mean": 0.70,
        "employment_months": (24, 120),
        "age_range": (30, 60),
        "credit_history_months": (24, 120),
        "digital_payment_ratio_mean": 0.60,
        "base_default_logit": -1.0,
    },
    "informal_worker": {
        "income_range": (15000, 45000),
        "income_stability_mean": 0.30,
        "employment_months": (1, 36),
        "age_range": (18, 55),
        "credit_history_months": (0, 24),
        "digital_payment_ratio_mean": 0.20,
        "base_default_logit": 0.8,
    },
}


def _sigmoid(x: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-x))


def generate_transactions(
    customer_id: int,
    income: float,
    persona: str,
    months: int = 6,
    fraud_probability: float = 0.0,
) -> List[Dict]:
    """Generate realistic transaction history for a customer."""
    transactions = []
    base_date = datetime.now() - timedelta(days=months * 30)

    for i in range(months):
        date = base_date + timedelta(days=i * 30 + random.randint(0, 5))
        income_variation = income * rng.normal(1.0, 0.1)
        transactions.append({
            "customer_id": customer_id,
            "amount": float(income_variation),
            "transaction_type": "income",
            "timestamp": date.isoformat(),
            "is_suspicious": False,
        })

    expense_ratio = rng.uniform(0.6, 0.8)
    monthly_expense = income * expense_ratio

    for i in range(months):
        num_transactions = random.randint(8, 15)
        for _ in range(num_transactions):
            date = base_date + timedelta(days=i * 30 + random.randint(0, 29))
            amount = monthly_expense / num_transactions * rng.uniform(0.5, 1.5)
            is_suspicious = random.random() < fraud_probability
            transactions.append({
                "customer_id": customer_id,
                "amount": -float(amount),
                "transaction_type": "expense",
                "timestamp": date.isoformat(),
                "is_suspicious": is_suspicious,
            })

    for _ in range(random.randint(0, 3)):
        date = base_date + timedelta(days=random.randint(0, months * 30))
        amount = income * rng.uniform(0.5, 2.0)
        is_suspicious = random.random() < fraud_probability * 2
        transactions.append({
            "customer_id": customer_id,
            "amount": -float(amount),
            "transaction_type": "expense",
            "timestamp": date.isoformat(),
            "is_suspicious": is_suspicious,
        })

    return transactions


def generate_customer(customer_id: int, persona: str, fraud_flag: bool = False) -> Dict:
    """Generate a single customer with a latent default probability."""
    config = PERSONAS[persona]

    age = random.randint(*config["age_range"])
    employment_months = random.randint(*config["employment_months"])
    credit_history_months = random.randint(*config["credit_history_months"])

    monthly_income = float(rng.uniform(*config["income_range"]))
    income_stability = float(rng.normal(config["income_stability_mean"], 0.12))
    income_stability = max(0.0, min(1.0, income_stability))

    expense_ratio = rng.uniform(0.4, 0.8)
    monthly_expenses = monthly_income * expense_ratio

    has_debt = random.random() < 0.3
    existing_debt = float(monthly_income * rng.uniform(2, 8)) if has_debt else 0.0

    if credit_history_months > 12:
        repayment_history = float(rng.beta(2 + 3 * (1 - config["base_default_logit"]), 3))
    else:
        repayment_history = 0.5
    repayment_history = max(0.0, min(1.0, repayment_history))

    late_payments = int(rng.poisson(max(0.5, 3 * (1 - repayment_history))))

    transaction_count = random.randint(20, 100)
    avg_transaction = monthly_expenses / max(transaction_count / 6, 1)
    cashflow_volatility = float(1.0 - income_stability + rng.normal(0, 0.1))
    cashflow_volatility = max(0.0, min(1.0, cashflow_volatility))

    digital_payment_ratio = float(rng.normal(config["digital_payment_ratio_mean"], 0.15))
    digital_payment_ratio = max(0.0, min(1.0, digital_payment_ratio))

    account_age_months = max(credit_history_months, random.randint(3, 60))

    suspicious_count = int(rng.poisson(5)) if fraud_flag else int(rng.poisson(0.5))
    connected_accounts = int(rng.poisson(8)) if fraud_flag else int(rng.poisson(2))

    device_fingerprint = f"device_{customer_id % 100}" if fraud_flag else f"device_{customer_id}"

    loan_amount = float(monthly_income * rng.uniform(2, 12))
    loan_term = random.choice([6, 12, 18, 24, 36])

    # Latent probability of default from persona + financial health.
    dti = (monthly_expenses + (existing_debt / 12)) / max(monthly_income, 1)

    logit = config["base_default_logit"]
    logit += 2.5 * dti
    logit -= 1.2 * income_stability
    logit -= 0.8 * repayment_history
    logit += 0.15 * late_payments
    logit += 0.7 * cashflow_volatility
    logit -= 0.02 * credit_history_months
    logit -= 0.015 * account_age_months
    logit += 0.08 * suspicious_count
    logit += 0.05 * connected_accounts
    logit += 0.3 * (digital_payment_ratio < 0.3)
    logit -= 0.2 * (digital_payment_ratio > 0.7)
    logit += rng.normal(0, 0.25)

    p_default = float(_sigmoid(np.array([logit]))[0])
    p_default = max(0.001, min(0.999, p_default))
    default = bool(rng.random() < p_default)

    if p_default < 0.20:
        risk_band = "LOW"
    elif p_default < 0.45:
        risk_band = "MEDIUM"
    else:
        risk_band = "HIGH"

    return {
        "customer_id": customer_id,
        "age": age,
        "employment_type": persona,
        "employment_months": employment_months,
        "monthly_income": monthly_income,
        "monthly_expenses": monthly_expenses,
        "existing_debt": existing_debt,
        "credit_history_months": credit_history_months,
        "income_stability": income_stability,
        "repayment_history": repayment_history,
        "late_payment_count": late_payments,
        "transaction_count": transaction_count,
        "avg_transaction": avg_transaction,
        "cashflow_volatility": cashflow_volatility,
        "digital_payment_ratio": digital_payment_ratio,
        "account_age_months": account_age_months,
        "suspicious_transaction_count": suspicious_count,
        "connected_accounts": connected_accounts,
        "device_fingerprint": device_fingerprint,
        "loan_amount": loan_amount,
        "loan_term": loan_term,
        "p_default": round(p_default, 6),
        "default": int(default),
        "risk_band": risk_band,
        "fraud_flag": fraud_flag,
    }


def generate_dataset(n_customers: int = 2000) -> pd.DataFrame:
    """Generate complete synthetic dataset."""
    personas_list = list(PERSONAS.keys())
    customers = []

    for i in range(n_customers):
        persona = personas_list[i % len(personas_list)]
        fraud_flag = random.random() < 0.05
        customers.append(generate_customer(
            customer_id=i + 1,
            persona=persona,
            fraud_flag=fraud_flag,
        ))

    df = pd.DataFrame(customers)
    df.to_csv(DATASET_PATH, index=False)

    print(f"Generated {len(df)} customers")
    print(f"Default rate: {df['default'].mean():.2%}")
    print(f"Risk band distribution:\n{df['risk_band'].value_counts()}")
    print(f"Fraud rate: {df['fraud_flag'].mean():.2%}")
    print(f"Saved to {DATASET_PATH}")
    return df


if __name__ == "__main__":
    generate_dataset(2000)
