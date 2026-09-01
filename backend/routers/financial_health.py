from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.core.database import get_db
from backend.core.auth import get_current_user
from backend.models import Customer
from backend.schemas import FinancialHealthResponse, FinancialHealthPoint

router = APIRouter(prefix="/api/v1/customers", tags=["financial-health"])


@router.get("/{customer_id}/financial-health", response_model=FinancialHealthResponse)
def get_financial_health(customer_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    from backend.services.monitoring_service import get_financial_timeline

    timeline = get_financial_timeline(customer_id, db)
    return FinancialHealthResponse(customer_id=customer_id, timeline=timeline)
