from sqlalchemy import (
    Column, Integer, String, Float, Boolean, DateTime, ForeignKey, Text, Enum as SAEnum,
)
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
import enum

from backend.core.database import Base


class EmploymentType(str, enum.Enum):
    salaried = "salaried"
    freelancer = "freelancer"
    small_shop_owner = "small_shop_owner"
    online_seller = "online_seller"
    driver = "driver"
    small_business_owner = "small_business_owner"
    informal_worker = "informal_worker"


class Customer(Base):
    __tablename__ = "customers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    employment_type = Column(String(50), nullable=False)
    monthly_income = Column(Float, nullable=False)
    monthly_expenses = Column(Float, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    financial_profile = relationship("FinancialProfile", back_populates="customer", uselist=False)
    applications = relationship("Application", back_populates="customer")
    transactions = relationship("Transaction", back_populates="customer", foreign_keys="Transaction.customer_id")


class FinancialProfile(Base):
    __tablename__ = "financial_profiles"

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id"), unique=True, nullable=False)
    transaction_count = Column(Integer, default=0)
    avg_transaction = Column(Float, default=0.0)
    cashflow_volatility = Column(Float, default=0.0)
    digital_payment_ratio = Column(Float, default=0.0)
    account_age_months = Column(Integer, default=0)
    income_stability = Column(Float, default=0.0)
    repayment_history = Column(Float, default=0.0)
    late_payment_count = Column(Integer, default=0)
    existing_debt = Column(Float, default=0.0)
    suspicious_transaction_count = Column(Integer, default=0)
    connected_accounts = Column(Integer, default=0)
    merchant_count = Column(Integer, default=0)
    age = Column(Integer, default=25)
    loan_amount = Column(Float, default=0.0)
    loan_term = Column(Integer, default=6)
    device_fingerprint = Column(String(100), nullable=True)
    employment_months = Column(Integer, default=0)
    credit_history_months = Column(Integer, default=0)

    customer = relationship("Customer", back_populates="financial_profile")


class ApplicationStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"
    manual_review = "manual_review"


class Application(Base):
    __tablename__ = "applications"

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=False)
    requested_amount = Column(Float, nullable=False)
    requested_tenure_months = Column(Integer, nullable=False)
    status = Column(String(30), default="pending")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    customer = relationship("Customer", back_populates="applications")
    risk_assessment = relationship("RiskAssessment", back_populates="application", uselist=False)
    fraud_alerts = relationship("FraudAlert", back_populates="application")


class RiskLevel(str, enum.Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


class Decision(str, enum.Enum):
    APPROVE = "APPROVE"
    REJECT = "REJECT"
    MANUAL_REVIEW = "MANUAL_REVIEW"


class RiskAssessment(Base):
    __tablename__ = "risk_assessments"

    id = Column(Integer, primary_key=True, index=True)
    application_id = Column(Integer, ForeignKey("applications.id"), unique=True, nullable=False)
    credit_score = Column(Integer, nullable=True)
    repayment_probability = Column(Float, nullable=True)
    risk_level = Column(String(20), nullable=True)
    decision = Column(String(30), nullable=True)
    recommended_amount = Column(Float, nullable=True)
    recommended_tenure_months = Column(Integer, nullable=True)
    fraud_flag = Column(Boolean, default=False)
    fraud_score = Column(Float, nullable=True)
    affordability_score = Column(Float, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    application = relationship("Application", back_populates="risk_assessment")
    risk_factors = relationship("RiskFactor", back_populates="risk_assessment")


class RiskFactor(Base):
    __tablename__ = "risk_factors"

    id = Column(Integer, primary_key=True, index=True)
    risk_assessment_id = Column(Integer, ForeignKey("risk_assessments.id"), nullable=False)
    factor_name = Column(String(200), nullable=False)
    direction = Column(String(20), nullable=False)
    weight = Column(Float, default=0.0)

    risk_assessment = relationship("RiskAssessment", back_populates="risk_factors")


class FraudAlert(Base):
    __tablename__ = "fraud_alerts"

    id = Column(Integer, primary_key=True, index=True)
    application_id = Column(Integer, ForeignKey("applications.id"), nullable=False)
    alert_type = Column(String(100), nullable=False)
    severity = Column(String(20), nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    application = relationship("Application", back_populates="fraud_alerts")


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=False)
    counterparty_id = Column(String(100), nullable=True)
    amount = Column(Float, nullable=False)
    channel = Column(String(50), default="mobile_wallet")
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    customer = relationship("Customer", back_populates="transactions", foreign_keys=[customer_id])
