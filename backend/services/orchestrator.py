"""Risk Orchestrator — combines all modules into a single risk assessment."""
from sqlalchemy.orm import Session
from backend.models import Application, RiskAssessment, RiskFactor, FraudAlert
from backend.schemas import RiskAssessmentResponse, RiskFactorResponse


class RiskOrchestrator:
    def __init__(self, db: Session):
        self.db = db

    def run(self, application: Application) -> RiskAssessmentResponse:
        customer = application.customer
        profile = customer.financial_profile

        if profile is None:
            raise ValueError("Customer has no financial profile")

        features = self._build_features(customer, profile, application)

        credit_result = self._run_credit_model(features)
        affordability_result = self._run_affordability(features, application)
        fraud_result = self._run_fraud_detection(features, application)
        graph_result = self._run_graph_check(customer.id)
        explanation = self._run_explanation(features, credit_result)

        risk_level = credit_result["risk_level"]
        decision = credit_result["decision"]

        fraud_score = fraud_result.get("fraud_score", 0.0)
        if graph_result.get("cluster_detected", False):
            fraud_score = max(fraud_score, 0.7)

        if fraud_result["fraud_flag"] or graph_result.get("cluster_detected", False):
            if risk_level == "LOW":
                decision = "REVIEW"
                risk_level = "MEDIUM"

        assessment = RiskAssessment(
            application_id=application.id,
            credit_score=credit_result["credit_score"],
            repayment_probability=credit_result["repayment_probability"],
            risk_level=risk_level,
            decision=decision,
            recommended_amount=affordability_result["recommended_amount"],
            recommended_tenure_months=affordability_result["recommended_tenure"],
            fraud_flag=fraud_result["fraud_flag"] or graph_result.get("cluster_detected", False),
            fraud_score=fraud_score,
            affordability_score=affordability_result.get("affordability_score", 0.0),
        )
        self.db.add(assessment)
        self.db.flush()

        for factor in explanation["factors"]:
            rf = RiskFactor(
                risk_assessment_id=assessment.id,
                factor_name=factor["factor"],
                direction=factor["direction"],
                weight=factor.get("weight", 0.0),
            )
            self.db.add(rf)

        if fraud_result["fraud_flag"]:
            for alert in fraud_result.get("alerts", []):
                fa = FraudAlert(
                    application_id=application.id,
                    alert_type=alert["type"],
                    severity=alert["severity"],
                    description=alert.get("description", ""),
                )
                self.db.add(fa)

        if graph_result.get("cluster_detected"):
            fa = FraudAlert(
                application_id=application.id,
                alert_type="RISK_CLUSTER",
                severity="HIGH",
                description=graph_result.get("description", "Connected risk cluster detected"),
            )
            self.db.add(fa)

        application.status = _decision_to_status(decision)
        self.db.commit()
        self.db.refresh(assessment)

        return RiskAssessmentResponse(
            id=assessment.id,
            application_id=assessment.application_id,
            credit_score=assessment.credit_score,
            repayment_probability=assessment.repayment_probability,
            risk_level=assessment.risk_level,
            decision=assessment.decision,
            recommended_amount=assessment.recommended_amount,
            recommended_tenure_months=assessment.recommended_tenure_months,
            fraud_flag=assessment.fraud_flag,
            fraud_score=assessment.fraud_score,
            top_factors=explanation["factors"],
            created_at=assessment.created_at,
        )

    def _build_features(self, customer, profile, application):
        return {
            "monthly_income": customer.monthly_income,
            "monthly_expenses": customer.monthly_expenses,
            "existing_debt": profile.existing_debt if profile else 0,
            "transaction_count": profile.transaction_count if profile else 0,
            "avg_transaction": profile.avg_transaction if profile else 0,
            "cashflow_volatility": profile.cashflow_volatility if profile else 0,
            "digital_payment_ratio": profile.digital_payment_ratio if profile else 0,
            "account_age_months": profile.account_age_months if profile else 0,
            "income_stability": profile.income_stability if profile else 0.5,
            "repayment_history": profile.repayment_history if profile else 0.5,
            "late_payment_count": profile.late_payment_count if profile else 0,
            "suspicious_transaction_count": profile.suspicious_transaction_count if profile else 0,
            "connected_accounts": profile.connected_accounts if profile else 0,
            "merchant_count": profile.merchant_count if profile else 0,
            "age": profile.age if profile else 25,
            "loan_amount": application.requested_amount,
            "loan_term": application.requested_tenure_months,
            "employment_type": customer.employment_type,
            "employment_months": profile.employment_months if profile else 0,
            "credit_history_months": profile.credit_history_months if profile else 0,
            "device_fingerprint": profile.device_fingerprint if profile else None,
            "customer_id": customer.id,
        }

    def _run_credit_model(self, features):
        from backend.services.credit_model import predict_credit
        return predict_credit(features)

    def _run_affordability(self, features, application):
        from backend.services.affordability import calculate_affordability
        return calculate_affordability(features, application)

    def _run_fraud_detection(self, features, application):
        from backend.services.fraud_detection import detect_fraud
        return detect_fraud(features, application)

    def _run_graph_check(self, customer_id):
        from backend.services.graph_service import check_risk_cluster
        return check_risk_cluster(customer_id, self.db)

    def _run_explanation(self, features, credit_result):
        from backend.services.explainability import generate_explanation
        return generate_explanation(features, credit_result)


def _decision_to_status(decision: str) -> str:
    mapping = {
        "APPROVE": "approved",
        "REVIEW": "manual_review",
        "DECLINE": "rejected",
    }
    return mapping.get(decision, "pending")
