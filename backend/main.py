from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.core.config import settings
from backend.core.database import Base, engine
from backend.routers import (
    customers,
    applications,
    risk_assessment,
    fraud,
    explanation,
    financial_health,
    copilot,
    dashboard,
    auth,
)

app = FastAPI(
    title="CreditSense AI",
    description="Explainable financial-risk intelligence platform",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(customers.router)
app.include_router(applications.router)
app.include_router(risk_assessment.router)
app.include_router(fraud.router)
app.include_router(explanation.router)
app.include_router(financial_health.router)
app.include_router(copilot.router)
app.include_router(dashboard.router)


@app.get("/health")
def health():
    return {"status": "healthy", "service": "CreditSense AI"}


@app.on_event("startup")
def on_startup():
    import backend.models  # noqa: ensure models are imported
    import backend.models.user  # noqa
    Base.metadata.create_all(bind=engine)
