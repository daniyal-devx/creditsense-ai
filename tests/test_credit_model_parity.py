"""Wave 1 parity test: the credit model must use the artifact's employment encoding
and produce deterministic, consistent predictions for all seeded demo personas.
"""
import pytest
from scripts.seed_db import DEMO_CUSTOMERS
from backend.services.credit_model import predict_credit


def _features(customer):
    return {
        **customer["profile"],
        "monthly_income": customer["monthly_income"],
        "monthly_expenses": customer["monthly_expenses"],
        "employment_type": customer["employment_type"],
    }


@pytest.mark.parametrize("customer", DEMO_CUSTOMERS, ids=lambda c: c["name"])
def test_predict_credit_is_deterministic(customer):
    features = _features(customer)
    result1 = predict_credit(features)
    result2 = predict_credit(features)

    assert result1["credit_score"] == result2["credit_score"]
    assert result1["risk_level"] == result2["risk_level"]
    assert result1["decision"] == result2["decision"]


@pytest.mark.parametrize("customer", DEMO_CUSTOMERS, ids=lambda c: c["name"])
def test_predict_credit_returns_valid_range(customer):
    result = predict_credit(_features(customer))
    assert 0 <= result["credit_score"] <= 1000
    assert result["risk_level"] in {"LOW", "MEDIUM", "HIGH"}
    assert result["decision"] in {"APPROVE", "REVIEW", "DECLINE"}
    assert 0.0 <= result["repayment_probability"] <= 1.0


def test_employment_encoding_comes_from_artifact():
    """If the artifact's categories are alphabetical, the hard-coded legacy map
    would have encoded 'driver' as 4; the artifact should encode it as 0.
    """
    from backend.services.credit_model import _load_artifact, MODEL_PATH, _encode_employment

    artifact = _load_artifact(MODEL_PATH)
    categories = artifact["employment_categories"]
    assert categories == sorted(categories)
    assert _encode_employment(artifact, "driver") == 0
    assert _encode_employment(artifact, "salaried") == categories.index("salaried")
