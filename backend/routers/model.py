"""Model metadata and metrics endpoints."""
from fastapi import APIRouter, Depends, HTTPException

from backend.core.auth import get_current_user
from backend.services.credit_model import get_model_metrics

router = APIRouter(prefix="/api/v1/model", tags=["model"])


@router.get("/metrics")
def model_metrics(user=Depends(get_current_user)):
    """Return the credit model's evaluation metrics and calibration data."""
    try:
        return get_model_metrics()
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load model metrics: {str(e)}")
