from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.core.config import settings
from backend.core.database import Base, engine, get_db_dialect
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
    model as model_router,
)


@asynccontextmanager
async def lifespan(_: FastAPI):
    import backend.models  # noqa: F401
    import backend.models.user  # noqa: F401

    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title="CreditSense AI",
    description="Explainable financial-risk intelligence platform",
    version="1.0.0",
    lifespan=lifespan,
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
app.include_router(model_router.router)


@app.get("/health")
def health():
    from backend.services.credit_model import artifact_info

    return {
        "status": "healthy",
        "service": "CreditSense AI",
        "db_dialect": get_db_dialect(),
        **artifact_info(),
    }
