from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.core.database import get_db
from backend.core.auth import get_current_user
from backend.models import Customer, Application, RiskAssessment, RiskFactor, FraudAlert
from backend.schemas import CopilotQuery, CopilotResponse

router = APIRouter(prefix="/api/v1/copilot", tags=["copilot"])


@router.post("/query", response_model=CopilotResponse)
def copilot_query(payload: CopilotQuery, db: Session = Depends(get_db), user=Depends(get_current_user)):
    customer = db.query(Customer).filter(Customer.id == payload.customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    from backend.services.copilot_service import generate_copilot_response

    return generate_copilot_response(payload.customer_id, payload.question, db)
