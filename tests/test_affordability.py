"""Tests for the affordability engine."""
from types import SimpleNamespace

import pytest

from backend.services.affordability import calculate_affordability


def _application(requested_amount, requested_tenure_months):
    return SimpleNamespace(
        requested_amount=requested_amount,
        requested_tenure_months=requested_tenure_months,
    )


def test_full_approval_when_request_fits_comfortably():
    features = {
        "monthly_income": 100_000,
        "monthly_expenses": 40_000,
        "existing_debt": 10_000,
        "income_stability": 0.8,
        "cashflow_volatility": 0.1,
    }
    app = _application(50_000, 12)

    result = calculate_affordability(features, app)

    assert result["recommended_amount"] == 50_000
    assert result["recommended_tenure"] == 12
    assert result["affordability_score"] == 1.0
    assert result["binding_constraint"] == "none"
    assert result["stress_test"]["passes"] is True


def test_recommendation_reduced_when_request_exceeds_installment():
    features = {
        "monthly_income": 50_000,
        "monthly_expenses": 35_000,
        "existing_debt": 5_000,
        "income_stability": 0.8,
        "cashflow_volatility": 0.1,
    }
    app = _application(200_000, 12)

    result = calculate_affordability(features, app)

    assert 0 < result["recommended_amount"] < 200_000
    assert result["binding_constraint"] == "disposable_income"
    assert result["recommended_tenure"] <= 24


def test_stressed_income_fails_approval():
    features = {
        "monthly_income": 60_000,
        "monthly_expenses": 45_000,
        "existing_debt": 5_000,
        "income_stability": 0.4,
        "cashflow_volatility": 0.6,
    }
    app = _application(100_000, 12)

    result = calculate_affordability(features, app)

    assert result["dti_ceiling"] == 0.25
    assert result["stress_test"]["passes"] is False


def test_zero_income_returns_zero_recommendation():
    features = {
        "monthly_income": 0,
        "monthly_expenses": 0,
        "existing_debt": 0,
    }
    app = _application(50_000, 12)

    result = calculate_affordability(features, app)

    assert result["recommended_amount"] == 0
    assert result["affordability_score"] == 0.0
    assert result["binding_constraint"] == "disposable_income"


def test_amount_rounded_to_nearest_thousand():
    features = {
        "monthly_income": 100_000,
        "monthly_expenses": 30_000,
        "existing_debt": 10_000,
        "income_stability": 0.8,
        "cashflow_volatility": 0.1,
    }
    app = _application(123_456, 12)

    result = calculate_affordability(features, app)

    assert result["recommended_amount"] % 1000 == 0


def test_total_cost_covers_installments():
    features = {
        "monthly_income": 100_000,
        "monthly_expenses": 40_000,
        "existing_debt": 10_000,
    }
    app = _application(50_000, 12)

    result = calculate_affordability(features, app)

    expected = round(result["monthly_installment"] * result["recommended_tenure"], 2)
    assert result["total_cost"] == expected


def test_dti_and_dsr_are_sensible():
    features = {
        "monthly_income": 100_000,
        "monthly_expenses": 40_000,
        "existing_debt": 10_000,
    }
    app = _application(50_000, 12)

    result = calculate_affordability(features, app)

    assert 0 <= result["dti"] <= 1
    assert 0 <= result["dsr"] <= 1
