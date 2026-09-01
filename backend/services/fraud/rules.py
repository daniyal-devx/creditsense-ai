"""Declarative fraud rule definitions."""
from dataclasses import dataclass
from typing import Callable, Dict, List


@dataclass(frozen=True)
class RuleResult:
    rule_id: str
    triggered: bool
    severity: str
    description: str
    score_contribution: float
    evidence: Dict


@dataclass(frozen=True)
class Rule:
    rule_id: str
    severity: str
    description: str
    weight: float
    check: Callable[[Dict], bool]
    evidence: Callable[[Dict], Dict]


RULES: List[Rule] = [
    Rule(
        rule_id="SUSPICIOUS_TRANSACTIONS",
        severity="HIGH",
        description="Customer has multiple suspicious transactions",
        weight=0.30,
        check=lambda f: f.get("suspicious_transaction_count", 0) > 3,
        evidence=lambda f: {"suspicious_transaction_count": f.get("suspicious_transaction_count", 0)},
    ),
    Rule(
        rule_id="EXCESSIVE_CONNECTIONS",
        severity="MEDIUM",
        description="Account is connected to many other accounts",
        weight=0.20,
        check=lambda f: f.get("connected_accounts", 0) > 5,
        evidence=lambda f: {"connected_accounts": f.get("connected_accounts", 0)},
    ),
    Rule(
        rule_id="UNUSUAL_TRANSACTION_SIZE",
        severity="MEDIUM",
        description="Average transaction size is unusually large relative to income",
        weight=0.20,
        check=lambda f: (
            (f.get("monthly_income", 0) or 0) > 0
            and (f.get("avg_transaction", 0) or 0) > (f.get("monthly_income", 0) or 0) * 0.8
        ),
        evidence=lambda f: {
            "monthly_income": f.get("monthly_income", 0),
            "avg_transaction": f.get("avg_transaction", 0),
        },
    ),
    Rule(
        rule_id="HIGH_VOLATILITY",
        severity="MEDIUM",
        description="Cashflow volatility exceeds normal threshold",
        weight=0.15,
        check=lambda f: (f.get("cashflow_volatility", 0) or 0) > 0.7,
        evidence=lambda f: {"cashflow_volatility": f.get("cashflow_volatility", 0)},
    ),
]


def evaluate_rules(features: Dict) -> List[RuleResult]:
    """Evaluate all declarative rules against a feature dictionary."""
    results = []
    for rule in RULES:
        triggered = rule.check(features)
        results.append(
            RuleResult(
                rule_id=rule.rule_id,
                triggered=triggered,
                severity=rule.severity,
                description=rule.description,
                score_contribution=rule.weight if triggered else 0.0,
                evidence=rule.evidence(features) if triggered else {},
            )
        )
    return results
