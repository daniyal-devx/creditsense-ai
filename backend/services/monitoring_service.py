"""Financial health monitoring — re-export for backward compatibility."""
from sqlalchemy.orm import Session

from backend.models import Customer, FinancialProfile
from backend.schemas import FinancialHealthPoint
from backend.services.financial_health_service import generate_financial_timeline


def get_financial_timeline(customer_id: int, db: Session) -> list[FinancialHealthPoint]:
    """Return a deterministic synthetic 6-month monitoring timeline."""
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        return []

    profile = customer.financial_profile
    if not profile:
        return []

    return generate_financial_timeline(customer, profile)
