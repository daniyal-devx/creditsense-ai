from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class CustomerCreate(BaseModel):
    name: str
    employment_type: str
    monthly_income: float
    monthly_expenses: float
    age: int = 25
    transaction_count: int = 0
    avg_transaction: float = 0.0
    cashflow_volatility: float = 0.0
    digital_payment_ratio: float = 0.0
    account_age_months: int = 0
    income_stability: float = 0.5
    repayment_history: float = 0.5
    late_payment_count: int = 0
    existing_debt: float = 0.0
    suspicious_transaction_count: int = 0
    connected_accounts: int = 0
    merchant_count: int = 0
    loan_amount: float = 0.0
    loan_term: int = 6
    device_fingerprint: Optional[str] = None
    employment_months: int = 0
    credit_history_months: int = 0


class CustomerResponse(BaseModel):
    id: int
    name: str
    employment_type: str
    monthly_income: float
    monthly_expenses: float
    created_at: datetime

    model_config = {"from_attributes": True}


class CustomerDetailResponse(CustomerResponse):
    financial_profile: Optional["FinancialProfileResponse"] = None


class FinancialProfileResponse(BaseModel):
    id: int
    customer_id: int
    transaction_count: int
    avg_transaction: float
    cashflow_volatility: float
    digital_payment_ratio: float
    account_age_months: int
    income_stability: float
    repayment_history: float
    late_payment_count: int
    existing_debt: float
    suspicious_transaction_count: int
    connected_accounts: int
    merchant_count: int
    age: int
    loan_amount: float
    loan_term: int
    device_fingerprint: Optional[str] = None

    model_config = {"from_attributes": True}


class ApplicationCreate(BaseModel):
    customer_id: int
    requested_amount: float
    requested_tenure_months: int


class ApplicationResponse(BaseModel):
    id: int
    customer_id: int
    requested_amount: float
    requested_tenure_months: int
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class RiskAssessmentRequest(BaseModel):
    application_id: int


class RiskFactorResponse(BaseModel):
    factor: str
    direction: str
    weight: float = 0.0


class RiskAssessmentResponse(BaseModel):
    id: int
    application_id: int
    credit_score: Optional[int] = None
    repayment_probability: Optional[float] = None
    risk_level: Optional[str] = None
    decision: Optional[str] = None
    recommended_amount: Optional[float] = None
    recommended_tenure_months: Optional[int] = None
    fraud_flag: bool = False
    fraud_score: Optional[float] = None
    top_factors: List[RiskFactorResponse] = []
    created_at: datetime

    model_config = {"from_attributes": True}


class FraudAlertResponse(BaseModel):
    id: int
    alert_type: str
    severity: str
    description: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class FraudRiskResponse(BaseModel):
    customer_id: int
    fraud_alerts: List[FraudAlertResponse] = []
    graph_data: Optional[dict] = None
    risk_cluster_detected: bool = False


class ExplanationResponse(BaseModel):
    customer_id: int
    positive_factors: List[str] = []
    negative_factors: List[str] = []


class FinancialHealthPoint(BaseModel):
    month: int
    credit_score: Optional[int] = None
    risk_level: Optional[str] = None
    income: Optional[float] = None
    expenses: Optional[float] = None
    distress_flag: bool = False
    note: Optional[str] = None


class FinancialHealthResponse(BaseModel):
    customer_id: int
    timeline: List[FinancialHealthPoint] = []


class CopilotQuery(BaseModel):
    customer_id: int
    question: str


class CopilotResponse(BaseModel):
    customer_id: int
    question: str
    answer: str
    sources_referenced: List[str] = []


class DashboardMetrics(BaseModel):
    total_customers: int = 0
    total_applications: int = 0
    applications_today: int = 0
    approval_rate: float = 0.0
    high_risk_count: int = 0
    fraud_alerts_count: int = 0
    early_warnings: int = 0
    portfolio_risk_distribution: dict = {}


class LoginRequest(BaseModel):
    email: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


class GraphNode(BaseModel):
    id: str
    label: str
    type: str
    highlighted: bool = False


class GraphEdge(BaseModel):
    source: str
    target: str
    type: str
    weight: float = 1.0
