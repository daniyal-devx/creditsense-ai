"""Wave 4 demo persona outcome checks.

These assertions encode the headline demo story:
- Ahmed (stable salaried) is approved.
- Bilal (volatile freelancer) is sent to manual review.
- Ayesha (fraud-ring online seller) is declined on credit risk alone.
"""
from scripts.seed_db import DEMO_CUSTOMERS
from backend.services.credit_model import predict_credit


def _features(customer):
    return {
        **customer["profile"],
        "monthly_income": customer["monthly_income"],
        "monthly_expenses": customer["monthly_expenses"],
        "employment_type": customer["employment_type"],
    }


def test_ahmed_stable_salaried_approved():
    ahmed = next(c for c in DEMO_CUSTOMERS if c["name"].startswith("Ahmed"))
    result = predict_credit(_features(ahmed))
    assert result["decision"] == "APPROVE"
    assert result["risk_level"] == "LOW"
    assert 700 <= result["credit_score"] <= 1000


def test_bilal_freelancer_review():
    bilal = next(c for c in DEMO_CUSTOMERS if c["name"].startswith("Bilal"))
    result = predict_credit(_features(bilal))
    assert result["decision"] == "REVIEW"
    assert result["risk_level"] == "MEDIUM"
    assert 450 <= result["credit_score"] <= 700


def test_ayesha_fraud_ring_declined():
    ayesha = next(c for c in DEMO_CUSTOMERS if c["name"].startswith("Ayesha"))
    result = predict_credit(_features(ayesha))
    assert result["decision"] == "DECLINE"
    assert result["risk_level"] == "HIGH"
    assert 0 <= result["credit_score"] < 500


def test_all_personas_have_valid_credit_responses():
    for customer in DEMO_CUSTOMERS:
        result = predict_credit(_features(customer))
        assert 0 <= result["credit_score"] <= 1000
        assert result["risk_level"] in {"LOW", "MEDIUM", "HIGH"}
        assert result["decision"] in {"APPROVE", "REVIEW", "DECLINE"}
        assert 0.0 <= result["repayment_probability"] <= 1.0
