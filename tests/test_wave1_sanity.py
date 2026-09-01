"""Wave 1 sanity checks for security and health endpoint behaviour."""
from fastapi.testclient import TestClient

from backend.main import app

client = TestClient(app)


def test_seed_admin_endpoint_removed():
    response = client.post("/api/v1/auth/seed-admin")
    assert response.status_code == 404


def test_health_reports_model_and_db():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "db_dialect" in data
    assert "model_version" in data
    assert "artifact_sha256" in data
    assert data["artifact_exists"] is True
