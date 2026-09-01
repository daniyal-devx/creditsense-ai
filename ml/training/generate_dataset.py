"""
Synthetic dataset generator for CreditSense AI.
Creates 7 personas with realistic financial profiles and deterministic credit labels.
"""
import random
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from typing import Dict, List

# Set seed for reproducibility
np.random.seed(42)
random.seed(42)

PERSONAS = {
    "salaried": {
        "income_range": (60000, 150000),
        "income_stability": 0.9,
        "employment_months": (24, 120),
        "age_range": (25, 55),
        "credit_history_months": (12, 120),
        "digital_payment_ratio": 0.7,
        "base_score_bias": 100,  # Generally lower risk
    },
    "freelancer": {
        "income_range": (40000, 120000),
        "income_stability": 0.5,
        "employment_months": (6, 60),
        "age_range": (22, 45),
        "credit_history_months": (6, 60),
        "digital_payment_ratio": 0.8,
        "base_score_bias": 0,
    },
    "small_shop_owner": {
        "income_range": (35000, 90000),
        "income_stability": 0.6,
        "employment_months": (12, 96),
        "age_range": (28, 60),
        "credit_history_months": (12, 96),
        "digital_payment_ratio": 0.4,
        "base_score_bias": 20,
    },
    "online_seller": {
        "income_range": (30000, 100000),
        "income_stability": 0.55,
        "employment_months": (3, 48),
        "age_range": (20, 40),
        "credit_history_months": (3, 48),
        "digital_payment_ratio": 0.95,
        "base_score_bias": -20,
    },
    "driver": {
        "income_range": (25000, 60000),
        "income_stability": 0.65,
        "employment_months": (6, 60),
        "age_range": (22, 50),
        "credit_history_months": (3, 48),
        "digital_payment_ratio": 0.6,
        "base_score_bias": -30,
    },
    "small_business_owner": {
        "income_range": (50000, 200000),
        "income_stability": 0.7,
        "employment_months": (24, 120),
        "age_range": (30, 60),
        "credit_history_months": (24, 120),
        "digital_payment_ratio": 0.6,
        "base_score_bias": 50,
    },
    "informal_worker": {
        "income_range": (15000, 45000),
        "income_stability": 0.3,
        "employment_months": (1, 36),
        "age_range": (18, 55),
        "credit_history_months": (0, 24),
        "digital_payment_ratio": 0.2,
        "base_score_bias": -80,
    },
}


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

    # Monthly income transactions
    for i in range(months):
        date = base_date + timedelta(days=i * 30 + random.randint(0, 5))
        income_variation = income * np.random.normal(1.0, 0.1)
        transactions.append({
            "customer_id": customer_id,
            "amount": float(income_variation),
            "transaction_type": "income",
            "timestamp": date.isoformat(),
            "is_suspicious": False,
        })

    # Regular expenses (60-80% of income)
    expense_ratio = np.random.uniform(0.6, 0.8)
    monthly_expense = income * expense_ratio

    for i in range(months):
        # Multiple small transactions per month
        num_transactions = random.randint(8, 15)
        for _ in range(num_transactions):
            date = base_date + timedelta(days=i * 30 + random.randint(0, 29))
            amount = monthly_expense / num_transactions * np.random.uniform(0.5, 1.5)
            is_suspicious = random.random() < fraud_probability
            transactions.append({
                "customer_id": customer_id,
                "amount": -float(amount),
                "transaction_type": "expense",
                "timestamp": date.isoformat(),
                "is_suspicious": is_suspicious,
            })

    # Occasional large transactions
    for _ in range(random.randint(0, 3)):
        date = base_date + timedelta(days=random.randint(0, months * 30))
        amount = income * np.random.uniform(0.5, 2.0)
        is_suspicious = random.random() < fraud_probability * 2
        transactions.append({
            "customer_id": customer_id,
            "amount": -float(amount),
            "transaction_type": "expense",
            "timestamp": date.isoformat(),
            "is_suspicious": is_suspicious,
        })

    return transactions


def generate_customer(
    customer_id: int,
    persona: str,
    label: str = None,
    fraud_flag: bool = False,
) -> Dict:
    """Generate a single customer with financial profile."""
    config = PERSONAS[persona]

    # Basic demographics
    age = random.randint(*config["age_range"])
    employment_months = random.randint(*config["employment_months"])
    credit_history_months = random.randint(*config["credit_history_months"])

    # Financial profile
    monthly_income = float(np.random.uniform(*config["income_range"]))
    income_stability = float(np.random.normal(config["income_stability"], 0.1))
    income_stability = max(0.0, min(1.0, income_stability))

    # Expenses (40-80% of income)
    expense_ratio = np.random.uniform(0.4, 0.8)
    monthly_expenses = monthly_income * expense_ratio

    # Existing debt
    has_debt = random.random() < 0.3
    existing_debt = float(monthly_income * np.random.uniform(2, 8)) if has_debt else 0.0

    # Credit behavior
    repayment_history = float(np.random.beta(5, 2)) if credit_history_months > 12 else 0.5
    late_payments = int(np.random.poisson(2)) if repayment_history < 0.7 else 0

    # Transaction behavior
    transaction_count = random.randint(20, 100)
    avg_transaction = monthly_expenses / max(transaction_count / 6, 1)
    cashflow_volatility = float(1.0 - income_stability + np.random.normal(0, 0.1))
    cashflow_volatility = max(0.0, min(1.0, cashflow_volatility))

    digital_payment_ratio = float(np.random.normal(config["digital_payment_ratio"], 0.15))
    digital_payment_ratio = max(0.0, min(1.0, digital_payment_ratio))

    account_age_months = max(credit_history_months, random.randint(3, 60))

    # Fraud indicators
    suspicious_count = int(np.random.poisson(5)) if fraud_flag else int(np.random.poisson(0.5))
    connected_accounts = int(np.random.poisson(8)) if fraud_flag else int(np.random.poisson(2))

    # Device fingerprint (for fraud cluster detection)
    device_fingerprint = f"device_{customer_id % 100}" if fraud_flag else f"device_{customer_id}"

    # Loan request
    loan_amount = float(monthly_income * np.random.uniform(2, 12))
    loan_term = random.choice([6, 12, 18, 24, 36])

    # Generate label if not provided
    if label is None:
        # Calculate base score (higher starting point)
        base_score = 600 + config["base_score_bias"]

        # Adjust for financial health
        dti = (monthly_expenses + (existing_debt / 12)) / monthly_income
        if dti < 0.3:
            base_score += 80
        elif dti > 0.5:
            base_score -= 80

        if income_stability > 0.7:
            base_score += 60
        elif income_stability < 0.4:
            base_score -= 60

        if credit_history_months > 24:
            base_score += 60
        elif credit_history_months < 6:
            base_score -= 40

        if repayment_history > 0.7:
            base_score += 80
        elif repayment_history < 0.5:
            base_score -= 60

        # Add noise
        base_score += int(np.random.normal(0, 40))
        base_score = max(300, min(850, base_score))

        # Determine label (adjusted thresholds)
        if base_score >= 650:
            label = "LOW"
        elif base_score >= 450:
            label = "MEDIUM"
        else:
            label = "HIGH"

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
        "label": label,
        "fraud_flag": fraud_flag,
    }


def generate_dataset(n_customers: int = 1000) -> pd.DataFrame:
    """Generate complete synthetic dataset."""
    customers = []
    personas_list = list(PERSONAS.keys())

    for i in range(n_customers):
        # Distribute personas
        persona = personas_list[i % len(personas_list)]

        # 5% fraud rate
        fraud_flag = random.random() < 0.05

        customer = generate_customer(
            customer_id=i + 1,
            persona=persona,
            fraud_flag=fraud_flag,
        )
        customers.append(customer)

    df = pd.DataFrame(customers)

    # Save to CSV
    df.to_csv("ml/data/credit_dataset.csv", index=False)
    print(f"Generated {len(df)} customers")
    print(f"Label distribution:\n{df['label'].value_counts()}")
    print(f"Fraud rate: {df['fraud_flag'].mean():.2%}")

    return df


if __name__ == "__main__":
    df = generate_dataset(1000)
