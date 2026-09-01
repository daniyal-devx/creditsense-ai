"""Wave 1 sanity checks for security and health endpoint behaviour."""
import os
from pathlib import Path
import sqlite3
import subprocess
import sys

import bcrypt
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


def test_demo_auth_seed_creates_quick_fill_accounts(tmp_path):
    database_path = tmp_path / "demo-auth.db"
    environment = os.environ.copy()
    environment["DATABASE_URL"] = f"sqlite:///{database_path.as_posix()}"

    subprocess.run(
        [sys.executable, "scripts/seed_db.py", "--reset", "--demo-auth"],
        cwd=Path(__file__).resolve().parents[1],
        env=environment,
        check=True,
        capture_output=True,
        text=True,
    )

    with sqlite3.connect(database_path) as connection:
        users = {
            email: (hashed_password, role)
            for email, hashed_password, role in connection.execute(
                "SELECT email, hashed_password, role FROM users"
            )
        }

    expected_users = {
        "admin@creditsense.ai": ("admin123", "admin"),
        "officer@creditsense.ai": ("officer123", "loan_officer"),
        "risk@creditsense.ai": ("risk123", "risk_manager"),
        "fraud@creditsense.ai": ("fraud123", "fraud_analyst"),
    }
    assert set(users) == set(expected_users)
    for email, (password, role) in expected_users.items():
        hashed_password, actual_role = users[email]
        assert bcrypt.checkpw(password.encode(), hashed_password.encode())
        assert actual_role == role
