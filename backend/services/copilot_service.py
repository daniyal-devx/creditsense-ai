"""AI Risk Copilot — Module 6: grounded, guard-railed LLM responses."""
import re
from typing import Dict, List

from sqlalchemy.orm import Session

from backend.core.config import settings
from backend.models import Application, Customer, FinancialProfile, FraudAlert, RiskAssessment, RiskFactor
from backend.schemas import CopilotResponse
from backend.services.llm.groq_client import generate_copilot_answer


# Verbs the copilot must not use to make or imply a lending decision.
_FORBIDDEN_DECISION_VERBS = {
    "approve",
    "decline",
    "reject",
    "lend",
    "disburse",
    "grant",
    "deny",
    "accept",
    "refuse",
}


def _build_context(customer_id: int, db: Session) -> dict:
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        return {}

    profile = customer.financial_profile
    apps = db.query(Application).filter(Application.customer_id == customer_id).all()

    context = {
        "customer_name": customer.name,
        "employment_type": customer.employment_type,
        "monthly_income": customer.monthly_income,
        "monthly_expenses": customer.monthly_expenses,
    }

    if profile:
        context.update({
            "transaction_count": profile.transaction_count,
            "avg_transaction": profile.avg_transaction,
            "cashflow_volatility": profile.cashflow_volatility,
            "digital_payment_ratio": profile.digital_payment_ratio,
            "account_age_months": profile.account_age_months,
            "income_stability": profile.income_stability,
            "existing_debt": profile.existing_debt,
        })

    latest_assessment = None
    if apps:
        latest_app = sorted(apps, key=lambda a: a.created_at, reverse=True)[0]
        latest_assessment = db.query(RiskAssessment).filter(
            RiskAssessment.application_id == latest_app.id
        ).first()

        if latest_assessment:
            factors = db.query(RiskFactor).filter(
                RiskFactor.risk_assessment_id == latest_assessment.id
            ).all()

            context.update({
                "credit_score": latest_assessment.credit_score,
                "repayment_probability": latest_assessment.repayment_probability,
                "risk_level": latest_assessment.risk_level,
                "decision": latest_assessment.decision,
                "recommended_amount": latest_assessment.recommended_amount,
                "recommended_tenure": latest_assessment.recommended_tenure_months,
                "fraud_flag": latest_assessment.fraud_flag,
                "positive_factors": [f.factor_name for f in factors if f.direction == "positive"],
                "negative_factors": [f.factor_name for f in factors if f.direction == "negative"],
            })

            alerts = db.query(FraudAlert).filter(FraudAlert.application_id == latest_app.id).all()
            if alerts:
                context["fraud_alerts"] = [
                    {"type": a.alert_type, "severity": a.severity, "description": a.description}
                    for a in alerts
                ]

    return context


def _build_prompt(context: dict, question: str) -> str:
    context_str = "\n".join(f"- {k}: {v}" for k, v in context.items())
    return f"""You are CreditSense AI Risk Copilot. Answer the question using ONLY the data below.
If something is not in the data, say "This information is not available in the customer's record."
Never invent numbers or make assumptions beyond what is provided.
You MUST NOT approve, decline, reject, lend, disburse, grant, deny, accept, or refuse any application.
If the user asks you to make a decision, explain that only the risk orchestrator can do that and direct them to the displayed decision.

Customer Risk Assessment Data:
{context_str}

Question: {question}

Answer:"""


def _guard_answer(answer: str, context: dict) -> str:
    """Deflect any answer that appears to contain an independent decision verb."""
    lowered = answer.lower()
    tokens = re.findall(r"\b[a-z]+\b", lowered)
    if any(verb in tokens for verb in _FORBIDDEN_DECISION_VERBS):
        decision = context.get("decision", "the system's recommendation")
        return (
            "I can't make or change lending decisions. "
            f"The stored system recommendation for this customer is: {decision}. "
            "Please review the risk assessment details above or escalate to a human officer."
        )
    return answer


def _rule_based_answer(context: dict, question: str) -> str:
    q = question.lower()

    if "score" in q or "credit" in q:
        score = context.get("credit_score", "N/A")
        prob = context.get("repayment_probability", "N/A")
        level = context.get("risk_level", "N/A")
        return (
            f"Based on the customer's risk assessment: CreditSense Score is {score}/1000, "
            f"repayment probability is {prob}, and the risk level is {level}."
        )

    if "why" in q or "reason" in q or "explain" in q or "factor" in q:
        pos = context.get("positive_factors", [])
        neg = context.get("negative_factors", [])
        parts = []
        if pos:
            parts.append(f"Positive factors: {', '.join(pos)}")
        if neg:
            parts.append(f"Negative factors: {', '.join(neg)}")
        return "The risk assessment is influenced by: " + ". ".join(parts) + "." if parts else "No specific factor data available."

    if "lend" in q or "how much" in q or "amount" in q:
        amt = context.get("recommended_amount", "N/A")
        tenure = context.get("recommended_tenure", "N/A")
        return f"Based on the affordability analysis, the recommended loan amount is PKR {amt:,.0f} over {tenure} months." if isinstance(amt, (int, float)) else "No affordability data available."

    if "fraud" in q or "suspicious" in q or "trust" in q:
        flag = context.get("fraud_flag", False)
        alerts = context.get("fraud_alerts", [])
        if flag:
            alert_strs = [f"{a['type']} ({a['severity']})" for a in alerts]
            return f"Fraud risk detected. Alerts: {', '.join(alert_strs)}. Manual review recommended."
        return "No fraud alerts detected for this customer."

    if "profile" in q or "summary" in q or "overview" in q:
        return (
            f"Customer: {context.get('customer_name', 'N/A')}, "
            f"Employment: {context.get('employment_type', 'N/A')}, "
            f"Monthly Income: PKR {context.get('monthly_income', 0):,.0f}, "
            f"Monthly Expenses: PKR {context.get('monthly_expenses', 0):,.0f}, "
            f"Account Age: {context.get('account_age_months', 0)} months, "
            f"Credit Score: {context.get('credit_score', 'N/A')}/1000, "
            f"Decision: {context.get('decision', 'N/A')}."
        )

    if "decision" in q or "approve" in q or "reject" in q:
        return f"The system's recommendation is: {context.get('decision', 'N/A')}, with a risk level of {context.get('risk_level', 'N/A')}."

    return (
        f"Based on the available data for {context.get('customer_name', 'this customer')}: "
        f"Credit Score {context.get('credit_score', 'N/A')}/1000, "
        f"Risk Level {context.get('risk_level', 'N/A')}, "
        f"Decision: {context.get('decision', 'N/A')}. "
        f"Please ask more specific questions about the score, factors, affordability, or fraud risk."
    )


def _persist_conversation(customer_id: int, question: str, response: CopilotResponse, db: Session) -> None:
    """Placeholder: persist conversation/message rows once Wave 2 schema lands."""
    # Wave 2 will add `copilot_conversations` and `copilot_messages` tables.
    # For now we avoid writing to non-existent tables so the service stays testable.
    pass


def generate_copilot_response(customer_id: int, question: str, db: Session) -> CopilotResponse:
    context = _build_context(customer_id, db)

    if not context:
        return CopilotResponse(
            customer_id=customer_id,
            question=question,
            answer="No customer data found.",
            sources_referenced=[],
            grounded_fields=[],
            decision_source="system",
            mode="template",
        )

    # Independent decision prompts are deflected immediately.
    q_lower = question.lower()
    tokens = re.findall(r"\b[a-z]+\b", q_lower)
    if any(verb in tokens for verb in _FORBIDDEN_DECISION_VERBS):
        answer = (
            "I can't make or change lending decisions. "
            f"The stored system recommendation for this customer is: {context.get('decision', 'N/A')}."
        )
        response = CopilotResponse(
            customer_id=customer_id,
            question=question,
            answer=answer,
            sources_referenced=sorted(context.keys()),
            grounded_fields=["decision"],
            decision_source="system",
            mode="template",
        )
        _persist_conversation(customer_id, question, response, db)
        return response

    system_prompt = _build_prompt(context, question)
    user_prompt = question

    llm_error: str | None = None
    try:
        llm_result = generate_copilot_answer(system_prompt=system_prompt, user_prompt=user_prompt)
        answer = _guard_answer(llm_result["answer"], context)
        mode = "llm"
        decision_source = "system" if answer != llm_result["answer"] else "llm"
    except RuntimeError as exc:
        answer = _rule_based_answer(context, question)
        mode = "offline_template"
        decision_source = "llm_offline"
        llm_error = str(exc)

    response = CopilotResponse(
        customer_id=customer_id,
        question=question,
        answer=answer,
        sources_referenced=sorted(context.keys()),
        grounded_fields=sorted(context.keys()),
        decision_source=decision_source,
        mode=mode,
        error=llm_error,
    )
    _persist_conversation(customer_id, question, response, db)
    return response
