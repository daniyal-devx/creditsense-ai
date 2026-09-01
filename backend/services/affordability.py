"""Affordability Engine — Module 2.

Calculates how much a customer can afford to borrow given their cash flow,
existing debt, income stability and a stress scenario (rate +300 bps,
income -20%). Returns a recommended amount/tenure plus an affordability score.
"""
from backend.core.constants import (
    DEFAULT_MONTHLY_RATE,
    DTI_CEILING_STABLE,
    DTI_CEILING_STRESSED,
    MAX_LOAN_TENURE_MONTHS,
)


def calculate_affordability(features: dict, application) -> dict:
    income = max(0.0, float(features.get("monthly_income", 0) or 0))
    expenses = max(0.0, float(features.get("monthly_expenses", 0) or 0))
    existing_debt = max(0.0, float(features.get("existing_debt", 0) or 0))
    stability = float(features.get("income_stability", 0.5) or 0.5)
    volatility = float(features.get("cashflow_volatility", 0) or 0)

    disposable = max(0.0, income - expenses - existing_debt)

    # Policy ceiling: stricter when income is unstable or volatile.
    dti_ceiling = DTI_CEILING_STRESSED if stability < 0.5 or volatility > 0.5 else DTI_CEILING_STABLE
    max_installment = disposable * dti_ceiling

    requested = float(getattr(application, "requested_amount", 0) or 0)
    requested_tenure = int(getattr(application, "requested_tenure_months", 0) or 0)
    monthly_rate = DEFAULT_MONTHLY_RATE

    if max_installment <= 0 or requested <= 0 or requested_tenure <= 0:
        return _empty_result(disposable, dti_ceiling)

    requested_installment = _pmt(monthly_rate, requested_tenure, requested)

    if requested_installment <= max_installment:
        rec_amount = requested
        rec_tenure = requested_tenure
        binding_constraint = "none"
    else:
        rec_amount = _pv(monthly_rate, requested_tenure, max_installment)
        if rec_amount < requested * 0.3:
            rec_tenure = min(MAX_LOAN_TENURE_MONTHS, requested_tenure * 2)
            rec_amount = _pv(monthly_rate, rec_tenure, max_installment)
        else:
            rec_tenure = requested_tenure
        binding_constraint = "disposable_income"

    rec_amount = min(rec_amount, requested)
    rec_amount = round(rec_amount / 1000) * 1000
    rec_amount = max(0.0, rec_amount)

    monthly_installment = _pmt(monthly_rate, rec_tenure, rec_amount)
    total_cost = monthly_installment * rec_tenure
    apr = monthly_rate * 12

    dti = (monthly_installment + existing_debt) / max(income, 1)
    dsr = monthly_installment / max(disposable, 1)

    affordability_score = min(1.0, max_installment / max(requested_installment, 1))

    stress = _stress_test(
        income=income,
        expenses=expenses,
        existing_debt=existing_debt,
        stability=stability,
        volatility=volatility,
        monthly_installment=monthly_installment,
    )

    if stress["passes"] is False and binding_constraint == "none":
        binding_constraint = "stress_test"

    return {
        "recommended_amount": rec_amount,
        "recommended_tenure": rec_tenure,
        "affordability_score": round(affordability_score, 4),
        "monthly_installment": round(monthly_installment, 2),
        "disposable_income": round(disposable, 2),
        "dti": round(dti, 4),
        "dsr": round(dsr, 4),
        "dti_ceiling": dti_ceiling,
        "total_cost": round(total_cost, 2),
        "apr": round(apr, 4),
        "stress_test": stress,
        "binding_constraint": binding_constraint,
    }


def _empty_result(disposable: float, dti_ceiling: float) -> dict:
    return {
        "recommended_amount": 0,
        "recommended_tenure": 0,
        "affordability_score": 0.0,
        "monthly_installment": 0,
        "disposable_income": round(disposable, 2),
        "dti": 0.0,
        "dsr": 0.0,
        "dti_ceiling": dti_ceiling,
        "total_cost": 0.0,
        "apr": round(DEFAULT_MONTHLY_RATE * 12, 4),
        "stress_test": {
            "passes": False,
            "stressed_max_installment": 0.0,
            "stressed_dti_ceiling": DTI_CEILING_STRESSED,
        },
        "binding_constraint": "disposable_income",
    }


def _stress_test(
    *,
    income: float,
    expenses: float,
    existing_debt: float,
    stability: float,
    volatility: float,
    monthly_installment: float,
) -> dict:
    """Apply a stressed scenario: income drops 20%, rate +300 bps, ceiling tightens."""
    stressed_income = income * 0.8
    stressed_disposable = max(0.0, stressed_income - expenses - existing_debt)
    stressed_ceiling = DTI_CEILING_STRESSED
    stressed_max_installment = stressed_disposable * stressed_ceiling
    passes = monthly_installment <= stressed_max_installment

    return {
        "passes": passes,
        "stressed_max_installment": round(stressed_max_installment, 2),
        "stressed_dti_ceiling": stressed_ceiling,
        "stressed_income": round(stressed_income, 2),
        "stressed_disposable": round(stressed_disposable, 2),
    }


def _pmt(rate: float, nper: int, pv: float) -> float:
    if rate == 0:
        return pv / max(nper, 1)
    return pv * rate * (1 + rate) ** nper / ((1 + rate) ** nper - 1)


def _pv(rate: float, nper: int, pmt: float) -> float:
    if rate == 0:
        return pmt * nper
    return pmt * ((1 + rate) ** nper - 1) / (rate * (1 + rate) ** nper)
