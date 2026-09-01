from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.core.database import get_db
from backend.core.auth import get_current_user
from backend.models import Customer, Application, RiskAssessment, RiskFactor
from backend.schemas import ExplanationResponse

router = APIRouter(prefix="/api/v1/customers", tags=["explanation"])


@router.get("/{customer_id}/explanation", response_model=ExplanationResponse)
def get_explanation(customer_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    apps = db.query(Application).filter(Application.customer_id == customer_id).all()
    if not apps:
        return ExplanationResponse(customer_id=customer_id)

    latest_app = sorted(apps, key=lambda a: a.created_at, reverse=True)[0]
    assessment = db.query(RiskAssessment).filter(RiskAssessment.application_id == latest_app.id).first()
    if not assessment:
        return ExplanationResponse(customer_id=customer_id)

    factors = db.query(RiskFactor).filter(RiskFactor.risk_assessment_id == assessment.id).all()

    positive = [f.factor_name for f in factors if f.direction == "positive"]
    negative = [f.factor_name for f in factors if f.direction == "negative"]

    return ExplanationResponse(
        customer_id=customer_id,
        positive_factors=positive,
        negative_factors=negative,
    )
