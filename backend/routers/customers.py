from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.core.database import get_db
from backend.core.auth import get_current_user
from backend.models import Customer, FinancialProfile
from backend.schemas import CustomerCreate, CustomerDetailResponse, CustomerResponse, FinancialProfileResponse

router = APIRouter(prefix="/api/v1/customers", tags=["customers"])


@router.post("", response_model=CustomerDetailResponse)
def create_customer(payload: CustomerCreate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    customer = Customer(
        name=payload.name,
        employment_type=payload.employment_type,
        monthly_income=payload.monthly_income,
        monthly_expenses=payload.monthly_expenses,
    )
    db.add(customer)
    db.flush()

    profile = FinancialProfile(
        customer_id=customer.id,
        transaction_count=payload.transaction_count,
        avg_transaction=payload.avg_transaction,
        cashflow_volatility=payload.cashflow_volatility,
        digital_payment_ratio=payload.digital_payment_ratio,
        account_age_months=payload.account_age_months,
        income_stability=payload.income_stability,
        repayment_history=payload.repayment_history,
        late_payment_count=payload.late_payment_count,
        existing_debt=payload.existing_debt,
        suspicious_transaction_count=payload.suspicious_transaction_count,
        connected_accounts=payload.connected_accounts,
        merchant_count=payload.merchant_count,
        age=payload.age,
        loan_amount=payload.loan_amount,
        loan_term=payload.loan_term,
        device_fingerprint=payload.device_fingerprint,
        employment_months=payload.employment_months,
        credit_history_months=payload.credit_history_months,
    )
    db.add(profile)
    db.commit()
    db.refresh(customer)
    return customer


@router.get("/{customer_id}", response_model=CustomerDetailResponse)
def get_customer(customer_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    return customer


@router.get("", response_model=list[CustomerResponse])
def list_customers(skip: int = 0, limit: int = 50, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return db.query(Customer).offset(skip).limit(limit).all()
