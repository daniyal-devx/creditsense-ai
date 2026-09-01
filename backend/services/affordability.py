"""Affordability Engine — Module 2."""


def calculate_affordability(features: dict, application) -> dict:
    income = features.get("monthly_income", 0)
    expenses = features.get("monthly_expenses", 0)
    existing_debt = features.get("existing_debt", 0)
    stability = features.get("income_stability", 0.5)
    volatility = features.get("cashflow_volatility", 0)

    disposable = max(0, income - expenses - existing_debt)

    dti_ceiling = 0.35
    if stability < 0.5 or volatility > 0.5:
        dti_ceiling = 0.25

    max_installment = disposable * dti_ceiling

    requested = application.requested_amount
    requested_tenure = application.requested_tenure_months
    monthly_rate = 0.02

    if max_installment <= 0:
        return {
            "recommended_amount": 0,
            "recommended_tenure": requested_tenure,
            "affordability_score": 0.0,
            "monthly_installment": 0,
            "disposable_income": disposable,
        }

    requested_installment = _pmt(monthly_rate, requested_tenure, requested)

    if requested_installment <= max_installment:
        rec_amount = requested
        rec_tenure = requested_tenure
    else:
        rec_amount = _pv(monthly_rate, requested_tenure, max_installment)
        if rec_amount < requested * 0.3:
            rec_tenure = min(24, requested_tenure * 2)
            rec_amount = _pv(monthly_rate, rec_tenure, max_installment)
        else:
            rec_tenure = requested_tenure

    rec_amount = min(rec_amount, requested)
    rec_amount = round(rec_amount / 1000) * 1000

    affordability = min(1.0, max_installment / max(requested_installment, 1))

    return {
        "recommended_amount": max(0, rec_amount),
        "recommended_tenure": rec_tenure,
        "affordability_score": round(affordability, 2),
        "monthly_installment": round(_pmt(monthly_rate, rec_tenure, rec_amount), 2),
        "disposable_income": round(disposable, 2),
    }


def _pmt(rate, nper, pv):
    if rate == 0:
        return pv / nper
    return pv * rate * (1 + rate) ** nper / ((1 + rate) ** nper - 1)


def _pv(rate, nper, pmt):
    if rate == 0:
        return pmt * nper
    return pmt * ((1 + rate) ** nper - 1) / (rate * (1 + rate) ** nper)
