"""Seed the database with demo users and seven demo persona customers.

Uses Supabase Auth (service role) to create auth users when configured,
with local-only fallback for development.
"""
import argparse
import os
import sys
from typing import Optional

import httpx
from sqlalchemy.orm import Session

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.core.auth import hash_password
from backend.core.config import settings
from backend.core.database import Base, SessionLocal, engine
from backend.models import Customer, FinancialProfile
from backend.models.user import User

DEMO_AUTH_USERS = (
    ("admin@creditsense.ai", "admin123", "admin"),
    ("officer@creditsense.ai", "officer123", "loan_officer"),
    ("risk@creditsense.ai", "risk123", "risk_manager"),
    ("fraud@creditsense.ai", "fraud123", "fraud_analyst"),
)

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


class _SupabaseAdmin:
    """Minimal wrapper that calls Supabase Auth admin endpoints via httpx.

    Avoids the supabase Python SDK's create_client(), which (as of 2.10.0)
    rejects the newer sb_secret_ service-role key format at initialization
    even though the underlying admin endpoints accept it.
    """

    def __init__(self, url: str, service_role_key: str):
        self.url = url.rstrip("/")
        self.key = service_role_key
        self._http = httpx.Client(
            base_url=f"{self.url}/auth/v1",
            headers={
                "apikey": self.key,
                "Authorization": f"Bearer {self.key}",
                "Content-Type": "application/json",
            },
            timeout=15.0,
        )

    def create_user(self, email: str, password: str, role: str) -> Optional[str]:
        r = self._http.post(
            "/admin/users",
            json={
                "email": email,
                "password": password,
                "email_confirm": True,
                "user_metadata": {"role": role},
                "app_metadata": {"role": role},
            },
        )
        if r.status_code == 422 and "already registered" in r.text.lower():
            print(f"  Supabase user {email} already exists")
            return None
        r.raise_for_status()
        return r.json()["id"]

    def close(self):
        self._http.close()


def _supabase_available():
    return bool(settings.supabase_url and settings.supabase_service_role_key)


def _probe_supabase(admin: _SupabaseAdmin) -> bool:
    try:
        r = admin._http.get("/health")
        return r.status_code < 500
    except Exception:
        return False


def _ensure_local_user(db: Session, email: str, password: str, role: str):
    user = db.query(User).filter(User.email == email).first()
    if user:
        user.hashed_password = hash_password(password)
        user.role = role
    else:
        db.add(User(email=email, hashed_password=hash_password(password), role=role))


def reset_database():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    print("Database schema reset")


def seed_demo_auth(db: Session):
    admin: Optional[_SupabaseAdmin] = None
    if _supabase_available():
        candidate = _SupabaseAdmin(settings.supabase_url, settings.supabase_service_role_key)
        if _probe_supabase(candidate):
            admin = candidate
            print("Using Supabase Auth (service role) to create demo users")
        else:
            print("Supabase Auth unreachable; falling back to local-only seeding")
            candidate.close()

    for email, password, role in DEMO_AUTH_USERS:
        if admin:
            try:
                admin.create_user(email, password, role)
            except Exception as e:
                print(f"  Warning: could not create Supabase user {email}: {e}")
        _ensure_local_user(db, email, password, role)

    db.commit()
    if admin:
        admin.close()
    label = "Supabase + local" if admin else "local-only"
    print(f"Seeded {len(DEMO_AUTH_USERS)} demo accounts ({label})")


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


def main():
    parser = argparse.ArgumentParser(description="Seed deterministic CreditSense demo data.")
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Drop and recreate all tables before seeding.",
    )
    parser.add_argument(
        "--demo-auth",
        action="store_true",
        help="Seed demo accounts (Supabase Auth + local).",
    )
    args = parser.parse_args()

    if args.reset:
        reset_database()
    else:
        Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        if args.demo_auth:
            seed_demo_auth(db)
        else:
            seed_demo_auth(db)
        seed_customers(db)
    finally:
        db.close()
    print("Database seeded successfully")


if __name__ == "__main__":
    main()
