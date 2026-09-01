"""Tests for the financial health timeline service."""
from types import SimpleNamespace

from backend.services.financial_health_service import (
    analyze_trends,
    generate_financial_timeline,
)


def _customer(**kwargs):
    defaults = {
        "id": 1,
        "name": "Test",
        "employment_type": "salaried",
        "monthly_income": 100000,
        "monthly_expenses": 40000,
    }
    return SimpleNamespace(**{**defaults, **kwargs})


def _profile(**kwargs):
    defaults = {
        "income_stability": 0.8,
        "repayment_history": 0.8,
        "cashflow_volatility": 0.1,
        "late_payment_count": 0,
        "existing_debt": 10000,
    }
    return SimpleNamespace(**{**defaults, **kwargs})


def test_timeline_is_deterministic():
    customer = _customer()
    profile = _profile()

    t1 = generate_financial_timeline(customer, profile)
    t2 = generate_financial_timeline(customer, profile)

    assert [p.model_dump() for p in t1] == [p.model_dump() for p in t2]
    assert len(t1) == 6


def test_deteriorating_profile_produces_distress():
    customer = _customer(monthly_income=50000, monthly_expenses=45000)
    profile = _profile(
        income_stability=0.3,
        cashflow_volatility=0.7,
        late_payment_count=3,
    )

    timeline = generate_financial_timeline(customer, profile)
    distress_points = [p for p in timeline if p.distress_flag]

    assert len(distress_points) > 0
    assert all(p.note is not None for p in distress_points)


def test_stable_profile_stays_mostly_healthy():
    customer = _customer(monthly_income=200000, monthly_expenses=50000)
    profile = _profile(income_stability=0.9, repayment_history=0.9)

    timeline = generate_financial_timeline(customer, profile)

    assert all(p.credit_score >= 500 for p in timeline)


def test_analyze_trends_detects_deterioration():
    customer = _customer(monthly_income=50000, monthly_expenses=45000)
    profile = _profile(income_stability=0.3, cashflow_volatility=0.7)

    timeline = generate_financial_timeline(customer, profile)
    trends = analyze_trends(timeline)

    assert trends["score_trend"] == "deteriorating"
    assert any("deteriorating" in w for w in trends["warnings"])
