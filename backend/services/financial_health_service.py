"""Financial health timeline — deterministic, trend-aware monitoring.

Generates a 6-month synthetic timeline from a seeded customer profile. The
output is byte-identical for the same inputs so the demo story is reproducible.
"""
from typing import List, Optional

from backend.schemas import FinancialHealthPoint


# Synthetic seed offsets derived from customer features. Kept constant so the
# same customer always produces the same timeline.
_MONTHS = 6


def _seed_from_profile(customer, profile) -> int:
    """Deterministic integer seed built from stable customer attributes."""
    base = customer.id if customer else 0
    emp = hash(customer.employment_type) if customer else 0
    inc = int(getattr(customer, "monthly_income", 0) or 0)
    stab = int((getattr(profile, "income_stability", 0.5) or 0.5) * 100)
    return abs(base + emp + inc + stab) % (2**31)


def _lcg(seed: int, index: int) -> float:
    """Simple deterministic pseudo-random float in [0, 1)."""
    value = (seed + index * 1103515245 + 12345) % (2**31)
    return value / (2**31)


def _perturb(seed: int, index: int, low: float, high: float) -> float:
    return low + _lcg(seed, index) * (high - low)


def _credit_score_from_profile(profile) -> int:
    """Derive a starting score from profile features (mirrors credit model direction)."""
    if not profile:
        return 650

    score = 650
    score += int((getattr(profile, "income_stability", 0.5) or 0.5) * 150)
    score += int((getattr(profile, "repayment_history", 0.5) or 0.5) * 100)
    score -= int((getattr(profile, "cashflow_volatility", 0) or 0) * 100)
    score -= int((getattr(profile, "late_payment_count", 0) or 0) * 25)
    score -= int((getattr(profile, "existing_debt", 0) or 0) / 10000)
    return max(300, min(1000, score))


def generate_financial_timeline(customer, profile, months: int = _MONTHS) -> List[FinancialHealthPoint]:
    """Return a deterministic list of monthly health points."""
    if not customer or not profile:
        return []

    seed = _seed_from_profile(customer, profile)
    base_income = float(getattr(customer, "monthly_income", 0) or 0)
    base_expenses = float(getattr(customer, "monthly_expenses", 0) or 0)
    score = _credit_score_from_profile(profile)
    income = base_income
    expenses = base_expenses

    # Precompute a deterministic deterioration path based on profile.
    deteriorating = (
        (getattr(profile, "income_stability", 0.5) or 0.5) < 0.5
        or (getattr(profile, "cashflow_volatility", 0) or 0) > 0.5
        or (getattr(profile, "late_payment_count", 0) or 0) > 0
    )

    timeline: List[FinancialHealthPoint] = []
    for month in range(1, months + 1):
        idx = month
        income_change = _perturb(seed, idx * 3, -0.05, 0.03)
        expense_change = _perturb(seed, idx * 3 + 1, -0.02, 0.06) * month
        score_change = int(_perturb(seed, idx * 3 + 2, -15, 6))

        income = max(0, income * (1 + income_change))
        expenses = max(0, base_expenses * (1 + expense_change))

        if deteriorating and month >= 3:
            score_change -= int(_perturb(seed, idx * 7, 20, 51))

        score = max(300, min(1000, score + score_change))
        risk_level = "LOW" if score >= 700 else ("MEDIUM" if score >= 500 else "HIGH")

        distress, note = _evaluate_distress(
            timeline=timeline,
            current_score=score,
            income=income,
            expenses=expenses,
            existing_debt=getattr(profile, "existing_debt", 0) or 0,
            month=month,
            deteriorating=deteriorating,
        )

        timeline.append(
            FinancialHealthPoint(
                month=month,
                credit_score=int(score),
                risk_level=risk_level,
                income=round(income, 2),
                expenses=round(expenses, 2),
                distress_flag=distress,
                note=note,
                synthetic=True,
            )
        )

    return timeline


def _evaluate_distress(
    *,
    timeline: List[FinancialHealthPoint],
    current_score: int,
    income: float,
    expenses: float,
    existing_debt: float,
    month: int,
    deteriorating: bool,
) -> tuple[bool, Optional[str]]:
    """Check deterioration rules and return a distress flag + human note."""
    dti = (expenses + existing_debt) / max(income, 1)

    if month >= 3 and deteriorating:
        score_drop = timeline[-2].credit_score - current_score if len(timeline) >= 3 else 0
        if score_drop > 40:
            return True, "Score dropped sharply over recent months"
        if dti > 0.65:
            return True, "Debt-to-income ratio crossed danger threshold"
        if month == _MONTHS and current_score < 600:
            return True, "Early financial distress detected"

    if dti > 0.45:
        return True, "DTI crossed affordability threshold"

    return False, None


def analyze_trends(timeline: List[FinancialHealthPoint]) -> dict:
    """Return trend summaries and any early warnings."""
    if len(timeline) < 2:
        return {"score_trend": "stable", "warnings": []}

    scores = [p.credit_score for p in timeline]
    incomes = [p.income for p in timeline]
    score_trend = scores[-1] - scores[0]
    income_trend = incomes[-1] - incomes[0]

    warnings = []
    if any(p.distress_flag for p in timeline):
        warnings.append("Distress flags observed in timeline")
    if score_trend < -40:
        warnings.append("Credit score deteriorating")
    if income_trend < 0:
        warnings.append("Income trend negative")

    return {
        "score_trend": "improving" if score_trend > 20 else ("deteriorating" if score_trend < -20 else "stable"),
        "income_trend": "improving" if income_trend > 0 else "declining",
        "score_delta": int(score_trend),
        "warnings": warnings,
    }
