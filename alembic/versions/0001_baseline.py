"""baseline schema

Revision ID: a1b2c3d4e5f6
Revises:
Create Date: 2026-09-02

On an existing database whose tables were created by Base.metadata.create_all,
stamp this revision as applied without re-running it:

    alembic stamp a1b2c3d4e5f6

For a fresh database, apply normally:

    alembic upgrade head
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "customers",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("employment_type", sa.String(length=50), nullable=False),
        sa.Column("monthly_income", sa.Float(), nullable=False),
        sa.Column("monthly_expenses", sa.Float(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )

    op.create_table(
        "financial_profiles",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("customer_id", sa.Integer(), sa.ForeignKey("customers.id"), nullable=False, unique=True),
        sa.Column("transaction_count", sa.Integer(), nullable=True),
        sa.Column("avg_transaction", sa.Float(), nullable=True),
        sa.Column("cashflow_volatility", sa.Float(), nullable=True),
        sa.Column("digital_payment_ratio", sa.Float(), nullable=True),
        sa.Column("account_age_months", sa.Integer(), nullable=True),
        sa.Column("income_stability", sa.Float(), nullable=True),
        sa.Column("repayment_history", sa.Float(), nullable=True),
        sa.Column("late_payment_count", sa.Integer(), nullable=True),
        sa.Column("existing_debt", sa.Float(), nullable=True),
        sa.Column("suspicious_transaction_count", sa.Integer(), nullable=True),
        sa.Column("connected_accounts", sa.Integer(), nullable=True),
        sa.Column("merchant_count", sa.Integer(), nullable=True),
        sa.Column("age", sa.Integer(), nullable=True),
        sa.Column("loan_amount", sa.Float(), nullable=True),
        sa.Column("loan_term", sa.Integer(), nullable=True),
        sa.Column("device_fingerprint", sa.String(length=100), nullable=True),
        sa.Column("employment_months", sa.Integer(), nullable=True),
        sa.Column("credit_history_months", sa.Integer(), nullable=True),
    )

    op.create_table(
        "applications",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("customer_id", sa.Integer(), sa.ForeignKey("customers.id"), nullable=False),
        sa.Column("requested_amount", sa.Float(), nullable=False),
        sa.Column("requested_tenure_months", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )

    op.create_table(
        "risk_assessments",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("application_id", sa.Integer(), sa.ForeignKey("applications.id"), nullable=False, unique=True),
        sa.Column("credit_score", sa.Integer(), nullable=True),
        sa.Column("repayment_probability", sa.Float(), nullable=True),
        sa.Column("risk_level", sa.String(length=20), nullable=True),
        sa.Column("decision", sa.String(length=30), nullable=True),
        sa.Column("recommended_amount", sa.Float(), nullable=True),
        sa.Column("recommended_tenure_months", sa.Integer(), nullable=True),
        sa.Column("fraud_flag", sa.Boolean(), nullable=True),
        sa.Column("fraud_score", sa.Float(), nullable=True),
        sa.Column("affordability_score", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )

    op.create_table(
        "risk_factors",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("risk_assessment_id", sa.Integer(), sa.ForeignKey("risk_assessments.id"), nullable=False),
        sa.Column("factor_name", sa.String(length=200), nullable=False),
        sa.Column("direction", sa.String(length=20), nullable=False),
        sa.Column("weight", sa.Float(), nullable=True),
    )

    op.create_table(
        "fraud_alerts",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("application_id", sa.Integer(), sa.ForeignKey("applications.id"), nullable=False),
        sa.Column("alert_type", sa.String(length=100), nullable=False),
        sa.Column("severity", sa.String(length=20), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )

    op.create_table(
        "transactions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("customer_id", sa.Integer(), sa.ForeignKey("customers.id"), nullable=False),
        sa.Column("counterparty_id", sa.String(length=100), nullable=True),
        sa.Column("amount", sa.Float(), nullable=False),
        sa.Column("channel", sa.String(length=50), nullable=True),
        sa.Column("timestamp", sa.DateTime(), nullable=True),
    )

    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("email", sa.String(length=200), nullable=False, unique=True),
        sa.Column("hashed_password", sa.String(length=300), nullable=False),
        sa.Column("role", sa.String(length=50), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "audit_logs",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("action", sa.String(length=100), nullable=False),
        sa.Column("entity_type", sa.String(length=100), nullable=True),
        sa.Column("entity_id", sa.Integer(), nullable=True),
        sa.Column("timestamp", sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("audit_logs")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
    op.drop_table("transactions")
    op.drop_table("fraud_alerts")
    op.drop_table("risk_factors")
    op.drop_table("risk_assessments")
    op.drop_table("applications")
    op.drop_table("financial_profiles")
    op.drop_table("customers")
