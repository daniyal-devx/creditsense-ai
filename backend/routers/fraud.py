from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.core.database import get_db
from backend.core.auth import get_current_user
from backend.models import Customer, FraudAlert, Application
from backend.schemas import FraudRiskResponse, FraudAlertResponse, GraphNode, GraphEdge

router = APIRouter(prefix="/api/v1/customers", tags=["fraud"])


@router.get("/{customer_id}/fraud-risk", response_model=FraudRiskResponse)
def get_fraud_risk(customer_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    apps = db.query(Application).filter(Application.customer_id == customer_id).all()
    app_ids = [a.id for a in apps]

    alerts = (
        db.query(FraudAlert).filter(FraudAlert.application_id.in_(app_ids)).all()
        if app_ids
        else []
    )

    from backend.services.graph_service import build_customer_graph, check_risk_cluster

    graph_data = build_customer_graph(customer_id, db)
    cluster_result = check_risk_cluster(customer_id, db)

    return FraudRiskResponse(
        customer_id=customer_id,
        fraud_alerts=[FraudAlertResponse.model_validate(a) for a in alerts],
        graph_data=graph_data,
        risk_cluster_detected=cluster_result.get("cluster_detected", False) or any(a.severity == "HIGH" for a in alerts),
    )
