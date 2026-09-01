from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from backend.core.database import get_db
from backend.core.auth import get_current_user
from backend.models import Application, RiskAssessment
from backend.schemas import (
    RiskAssessmentRequest,
    RiskAssessmentResponse,
    RiskFactorResponse,
)

router = APIRouter(prefix="/api/v1/risk-assessment", tags=["risk-assessment"])


@router.post("", response_model=RiskAssessmentResponse)
def run_risk_assessment(
    payload: RiskAssessmentRequest,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    application = (
        db.query(Application)
        .options(joinedload(Application.customer))
        .filter(Application.id == payload.application_id)
        .first()
    )
    if not application:
        raise HTTPException(status_code=404, detail="Application not found")

    from backend.services.orchestrator import RiskOrchestrator

    orchestrator = RiskOrchestrator(db)
    try:
        result = orchestrator.run(application)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Risk assessment failed: {str(e)}")

    return result


@router.get("/{assessment_id}", response_model=RiskAssessmentResponse)
def get_risk_assessment(assessment_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    assessment = db.query(RiskAssessment).filter(RiskAssessment.id == assessment_id).first()
    if not assessment:
        raise HTTPException(status_code=404, detail="Risk assessment not found")
    factors = [
        RiskFactorResponse(factor=f.factor_name, direction=f.direction, weight=f.weight)
        for f in assessment.risk_factors
    ]
    resp = RiskAssessmentResponse.model_validate(assessment)
    resp.top_factors = factors
    return resp
