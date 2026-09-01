"""Tests for the AI Risk Copilot service."""
from unittest.mock import MagicMock, patch

from backend.schemas import CopilotResponse
from backend.services.copilot_service import _guard_answer, generate_copilot_response


def _make_db():
    return MagicMock()


def test_offline_mode_returns_grounded_answer():
    context = {
        "customer_name": "Ahmed",
        "employment_type": "salaried",
        "monthly_income": 120000,
        "monthly_expenses": 40000,
        "credit_score": 953,
        "repayment_probability": 0.92,
        "risk_level": "LOW",
        "decision": "APPROVE",
        "recommended_amount": 100000,
        "recommended_tenure": 12,
        "fraud_flag": False,
        "positive_factors": ["income_stability", "repayment_history"],
        "negative_factors": [],
    }
    with patch("backend.services.copilot_service._build_context", return_value=context):
        response = generate_copilot_response(1, "What is the credit score?", _make_db())

    assert response.mode == "offline_template"
    assert "953" in response.answer
    assert "decision" in response.grounded_fields


def test_forbidden_decision_verb_is_deflected():
    context = {
        "customer_name": "Ahmed",
        "decision": "APPROVE",
        "risk_level": "LOW",
        "credit_score": 953,
    }
    with patch("backend.services.copilot_service._build_context", return_value=context):
        response = generate_copilot_response(1, "Please approve this loan now", _make_db())

    assert "can't make or change lending decisions" in response.answer
    assert response.mode == "template"
    assert response.decision_source == "system"


def test_guard_answer_deflects_injected_decision():
    context = {"decision": "REVIEW"}
    guarded = _guard_answer("I approve this application immediately", context)

    assert "can't make or change lending decisions" in guarded


def test_guard_answer_allows_safe_answer():
    context = {"decision": "APPROVE"}
    safe = "The customer's credit score is 953."
    guarded = _guard_answer(safe, context)

    assert guarded == safe
