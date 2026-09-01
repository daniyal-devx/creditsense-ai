"""Financial health monitoring — Module 7."""
from sqlalchemy.orm import Session
from backend.models import Customer, FinancialProfile
from backend.schemas import FinancialHealthPoint


def get_financial_timeline(customer_id: int, db: Session) -> list[FinancialHealthPoint]:
    """Generate a synthetic 5-month monitoring timeline for demo purposes."""
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        return []

    profile = customer.financial_profile
    if not profile:
        return []

    import random
    random.seed(customer_id)

    base_income = customer.monthly_income
    base_expenses = customer.monthly_expenses
    base_score = 750

    timeline = []
    score = base_score
    income = base_income

    for month in range(1, 6):
        distress = False
        note = None

        income_change = random.uniform(-0.05, 0.03)
        income = income * (1 + income_change)
        expense_change = random.uniform(-0.02, 0.06)
        expenses = base_expenses * (1 + expense_change * month)

        score_change = random.randint(-15, 5)
        score = max(300, min(1000, score + score_change))

        if month >= 3:
            if random.random() < 0.4:
                score -= random.randint(20, 50)
                distress = True
                if month == 3:
                    note = "Income slightly decreased"
                elif month == 4:
                    note = "Cashflow volatility increased"
                elif month == 5:
                    note = "Debt burden increased"
                    distress = True

        risk_level = "LOW" if score >= 700 else ("MEDIUM" if score >= 500 else "HIGH")

        timeline.append(FinancialHealthPoint(
            month=month,
            credit_score=int(score),
            risk_level=risk_level,
            income=round(income, 2),
            expenses=round(expenses, 2),
            distress_flag=distress,
            note=note,
        ))

    if len(timeline) >= 4 and timeline[-1].credit_score < 600:
        timeline[-1].note = "Early financial distress detected"
        timeline[-1].distress_flag = True

    return timeline
