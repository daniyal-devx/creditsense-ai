"""Seed the database with admin user and 7 demo persona customers."""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.orm import Session
from backend.core.database import SessionLocal, engine, Base
from backend.core.auth import hash_password
from backend.models import (
    Customer, FinancialProfile, Application, Transaction,
)
from backend.models.user import User, AuditLog

DEMO_CUSTOMERS = [
    {
        "name": "Ahmed (Salaried)",
        "employment_type": "salaried",
        "monthly_income": 120000,
        "monthly_expenses": 50000,
        "profile": {
            "transaction_count": 45,
            "avg_transaction": 3500,
            "cashflow_volatility": 0.15,
            "digital_payment_ratio": 0.80,
            "account_age_months": 48,
            "income_stability": 0.90,
            "repayment_history": 0.85,
            "late_payment_count": 0,
            "existing_debt": 15000,
            "suspicious_transaction_count": 0,
            "connected_accounts": 3,
            "merchant_count": 12,
            "age": 34,
            "loan_amount": 150000,
            "loan_term": 6,
            "device_fingerprint": "device_ahmed_clean_001",
            "employment_months": 60,
            "credit_history_months": 48,
        },
    },
    {
        "name": "Bilal (Freelancer)",
        "employment_type": "freelancer",
        "monthly_income": 80000,
        "monthly_expenses": 45000,
        "profile": {
            "transaction_count": 30,
            "avg_transaction": 2500,
            "cashflow_volatility": 0.45,
            "digital_payment_ratio": 0.60,
            "account_age_months": 24,
            "income_stability": 0.55,
            "repayment_history": 0.65,
            "late_payment_count": 1,
            "existing_debt": 10000,
            "suspicious_transaction_count": 0,
            "connected_accounts": 5,
            "merchant_count": 20,
            "age": 28,
            "loan_amount": 100000,
            "loan_term": 6,
            "device_fingerprint": "device_bilal_clean_002",
            "employment_months": 18,
            "credit_history_months": 24,
        },
    },
    {
        "name": "Fatima (Shop Owner)",
        "employment_type": "small_shop_owner",
        "monthly_income": 95000,
        "monthly_expenses": 55000,
        "profile": {
            "transaction_count": 60,
            "avg_transaction": 1800,
            "cashflow_volatility": 0.30,
            "digital_payment_ratio": 0.40,
            "account_age_months": 36,
            "income_stability": 0.70,
            "repayment_history": 0.75,
            "late_payment_count": 1,
            "existing_debt": 20000,
            "suspicious_transaction_count": 0,
            "connected_accounts": 2,
            "merchant_count": 8,
            "age": 42,
            "loan_amount": 200000,
            "loan_term": 12,
            "device_fingerprint": "device_fatima_clean_003",
            "employment_months": 84,
            "credit_history_months": 36,
        },
    },
    {
        "name": "Ayesha (Online Seller)",
        "employment_type": "online_seller",
        "monthly_income": 70000,
        "monthly_expenses": 40000,
        "profile": {
            "transaction_count": 80,
            "avg_transaction": 1200,
            "cashflow_volatility": 0.35,
            "digital_payment_ratio": 0.95,
            "account_age_months": 18,
            "income_stability": 0.60,
            "repayment_history": 0.70,
            "late_payment_count": 0,
            "existing_debt": 5000,
            "suspicious_transaction_count": 2,
            "connected_accounts": 8,
            "merchant_count": 35,
            "age": 25,
            "loan_amount": 80000,
            "loan_term": 6,
            "device_fingerprint": "device_fraud_ring_001",
            "employment_months": 12,
            "credit_history_months": 18,
        },
    },
    {
        "name": "Rashid (Driver)",
        "employment_type": "driver",
        "monthly_income": 45000,
        "monthly_expenses": 30000,
        "profile": {
            "transaction_count": 12,
            "avg_transaction": 800,
            "cashflow_volatility": 0.25,
            "digital_payment_ratio": 0.30,
            "account_age_months": 8,
            "income_stability": 0.65,
            "repayment_history": 0.60,
            "late_payment_count": 0,
            "existing_debt": 0,
            "suspicious_transaction_count": 0,
            "connected_accounts": 1,
            "merchant_count": 3,
            "age": 38,
            "loan_amount": 50000,
            "loan_term": 3,
            "device_fingerprint": "device_rashid_clean_004",
            "employment_months": 24,
            "credit_history_months": 8,
        },
    },
    {
        "name": "Usman (Business Owner)",
        "employment_type": "small_business_owner",
        "monthly_income": 200000,
        "monthly_expenses": 80000,
        "profile": {
            "transaction_count": 100,
            "avg_transaction": 5000,
            "cashflow_volatility": 0.20,
            "digital_payment_ratio": 0.70,
            "account_age_months": 60,
            "income_stability": 0.85,
            "repayment_history": 0.90,
            "late_payment_count": 0,
            "existing_debt": 30000,
            "suspicious_transaction_count": 1,
            "connected_accounts": 6,
            "merchant_count": 25,
            "age": 45,
            "loan_amount": 500000,
            "loan_term": 12,
            "device_fingerprint": "device_fraud_ring_001",
            "employment_months": 120,
            "credit_history_months": 60,
        },
    },
    {
        "name": "Nadia (Informal Worker)",
        "employment_type": "informal_worker",
        "monthly_income": 25000,
        "monthly_expenses": 22000,
        "profile": {
            "transaction_count": 5,
            "avg_transaction": 400,
            "cashflow_volatility": 0.70,
            "digital_payment_ratio": 0.10,
            "account_age_months": 3,
            "income_stability": 0.30,
            "repayment_history": 0.35,
            "late_payment_count": 3,
            "existing_debt": 15000,
            "suspicious_transaction_count": 0,
            "connected_accounts": 0,
            "merchant_count": 1,
            "age": 30,
            "loan_amount": 30000,
            "loan_term": 3,
            "device_fingerprint": "device_fraud_ring_001",
            "employment_months": 6,
            "credit_history_months": 3,
        },
    },
]


def create_tables():
    Base.metadata.create_all(bind=engine)


def seed_admin(db: Session):
    existing = db.query(User).filter(User.email == "admin@creditsense.ai").first()
    if existing:
        print("Admin user already exists")
        return existing

    admin = User(
        email="admin@creditsense.ai",
        hashed_password=hash_password("admin123"),
        role="admin",
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)
    print(f"Admin user created: {admin.email}")
    return admin


def seed_customers(db: Session):
    existing = db.query(Customer).first()
    if existing:
        print("Customers already exist, skipping")
        return

    for c in DEMO_CUSTOMERS:
        customer = Customer(
            name=c["name"],
            employment_type=c["employment_type"],
            monthly_income=c["monthly_income"],
            monthly_expenses=c["monthly_expenses"],
        )
        db.add(customer)
        db.flush()

        p = c["profile"]
        profile = FinancialProfile(
            customer_id=customer.id,
            transaction_count=p["transaction_count"],
            avg_transaction=p["avg_transaction"],
            cashflow_volatility=p["cashflow_volatility"],
            digital_payment_ratio=p["digital_payment_ratio"],
            account_age_months=p["account_age_months"],
            income_stability=p["income_stability"],
            repayment_history=p["repayment_history"],
            late_payment_count=p["late_payment_count"],
            existing_debt=p["existing_debt"],
            suspicious_transaction_count=p["suspicious_transaction_count"],
            connected_accounts=p["connected_accounts"],
            merchant_count=p["merchant_count"],
            age=p["age"],
            loan_amount=p["loan_amount"],
            loan_term=p["loan_term"],
            device_fingerprint=p["device_fingerprint"],
            employment_months=p["employment_months"],
            credit_history_months=p["credit_history_months"],
        )
        db.add(profile)

    db.commit()
    print(f"Created {len(DEMO_CUSTOMERS)} demo customers")


if __name__ == "__main__":
    create_tables()
    db = SessionLocal()
    try:
        seed_admin(db)
        seed_customers(db)
    finally:
        db.close()
    print("Database seeded successfully")
