from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from backend.core.database import get_db
from backend.core.auth import get_current_user
from backend.models import Customer, Application, RiskAssessment, FraudAlert
from backend.schemas import DashboardMetrics

router = APIRouter(prefix="/api/v1/dashboard", tags=["dashboard"])


@router.get("/metrics", response_model=DashboardMetrics)
def get_metrics(db: Session = Depends(get_db), user=Depends(get_current_user)):
    from datetime import datetime, timezone, timedelta

    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)

    total_customers = db.query(func.count(Customer.id)).scalar() or 0
    total_applications = db.query(func.count(Application.id)).scalar() or 0
    applications_today = (
        db.query(func.count(Application.id)).filter(Application.created_at >= today).scalar() or 0
    )

    approved = (
        db.query(func.count(RiskAssessment.id))
        .filter(RiskAssessment.decision == "APPROVE")
        .scalar() or 0
    )
    total_assessed = db.query(func.count(RiskAssessment.id)).scalar() or 0
    approval_rate = (approved / total_assessed * 100) if total_assessed > 0 else 0.0

    high_risk = (
        db.query(func.count(RiskAssessment.id))
        .filter(RiskAssessment.risk_level == "HIGH")
        .scalar() or 0
    )
    fraud_count = db.query(func.count(FraudAlert.id)).scalar() or 0

    manual_reviews = (
        db.query(func.count(RiskAssessment.id))
        .filter(RiskAssessment.decision == "MANUAL_REVIEW")
        .scalar() or 0
    )

    low = db.query(func.count(RiskAssessment.id)).filter(RiskAssessment.risk_level == "LOW").scalar() or 0
    medium = db.query(func.count(RiskAssessment.id)).filter(RiskAssessment.risk_level == "MEDIUM").scalar() or 0
    high = db.query(func.count(RiskAssessment.id)).filter(RiskAssessment.risk_level == "HIGH").scalar() or 0

    return DashboardMetrics(
        total_customers=total_customers,
        total_applications=total_applications,
        applications_today=applications_today,
        approval_rate=round(approval_rate, 1),
        high_risk_count=high_risk,
        fraud_alerts_count=fraud_count,
        early_warnings=manual_reviews,
        portfolio_risk_distribution={"LOW": low, "MEDIUM": medium, "HIGH": high},
    )
