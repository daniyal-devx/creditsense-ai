"""Validate the deterministic credit outcomes used in the product demo."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from backend.services.credit_model import predict_credit
from scripts.seed_db import DEMO_CUSTOMERS

EXPECTED_OUTCOMES = {
    "Ahmed": ("APPROVE", "LOW", 700, 1000),
    "Bilal": ("REVIEW", "MEDIUM", 450, 700),
    "Ayesha": ("DECLINE", "HIGH", 0, 499),
}


def features(customer: dict) -> dict:
    return {
        **customer["profile"],
        "monthly_income": customer["monthly_income"],
        "monthly_expenses": customer["monthly_expenses"],
        "employment_type": customer["employment_type"],
    }


def main() -> int:
    failures = []
    for name, (decision, risk_level, lower, upper) in EXPECTED_OUTCOMES.items():
        customer = next(customer for customer in DEMO_CUSTOMERS if customer["name"].startswith(name))
        result = predict_credit(features(customer))
        score = result["credit_score"]
        passed = (
            result["decision"] == decision
            and result["risk_level"] == risk_level
            and lower <= score <= upper
        )
        status = "PASS" if passed else "FAIL"
        print(
            f"{status}: {customer['name']} — score={score}, "
            f"risk={result['risk_level']}, decision={result['decision']}"
        )
        if not passed:
            failures.append(name)

    if failures:
        print(f"Demo verification failed: {', '.join(failures)}")
        return 1

    print("Demo verification passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
