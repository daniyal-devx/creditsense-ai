"""FraudSense engine — combines rules, anomaly, and network signals."""
from typing import Dict, Iterable, List, Optional, Tuple

from backend.services.fraud.anomaly import anomaly_score
from backend.services.fraud.network import detect_rings
from backend.services.fraud.rules import evaluate_rules


def detect_fraud(
    features: Dict,
    application,
    relationships: Optional[Iterable[Tuple[int, str, int]]] = None,
) -> Dict:
    """Run the full FraudSense assessment.

    Args:
        features: customer/application feature dictionary.
        application: application object (currently unused but kept for API parity).
        relationships: optional iterable of (customer_id, entity_type, entity_id).

    Returns:
        Dictionary with fraud_flag, fraud_score, components, alerts, and rules.
    """
    del application  # reserved for future application-level rules

    rule_results = evaluate_rules(features)
    triggered_rules = [r for r in rule_results if r.triggered]
    rule_score = sum(r.score_contribution for r in triggered_rules)

    anomaly = anomaly_score(features)
    anomaly_alert_score = 0.0
    anomaly_alert = None
    if anomaly["score"] > 0.6:
        anomaly_alert_score = anomaly["score"] * 0.3
        anomaly_alert = {
            "type": "ANOMALY_DETECTED",
            "severity": "HIGH" if anomaly["score"] > 0.8 else "MEDIUM",
            "description": f"Isolation Forest anomaly score: {anomaly['score']:.2f}",
        }

    network_score = 0.0
    network_findings = []
    network_alerts = []
    if relationships is not None:
        rings = detect_rings(relationships)
        network_findings = rings
        for ring in rings:
            network_score = max(network_score, 0.8)
            network_alerts.append({
                "type": "RISK_RING",
                "severity": "HIGH",
                "description": (
                    f"Ring of {len(ring['customer_ids'])} customers sharing "
                    f"{len(ring['shared_entities'])} entities"
                ),
            })

    fraud_score = min(1.0, rule_score + anomaly_alert_score + network_score)
    high_severity_count = sum(
        1 for a in triggered_rules if a.severity == "HIGH"
    ) + sum(1 for a in ([anomaly_alert] if anomaly_alert else []) if a["severity"] == "HIGH")
    fraud_flag = fraud_score > 0.5 or high_severity_count > 0

    alerts = [
        {
            "type": r.rule_id,
            "severity": r.severity,
            "description": r.description,
            "evidence": r.evidence,
        }
        for r in triggered_rules
    ]
    if anomaly_alert:
        alerts.append(anomaly_alert)
    alerts.extend(network_alerts)

    return {
        "fraud_flag": fraud_flag,
        "fraud_score": round(fraud_score, 4),
        "alerts": alerts,
        "components": {
            "rules": round(rule_score, 4),
            "anomaly": round(anomaly_alert_score, 4),
            "network": round(network_score, 4),
        },
        "rule_results": [
            {
                "rule_id": r.rule_id,
                "triggered": r.triggered,
                "severity": r.severity,
                "description": r.description,
                "score_contribution": r.score_contribution,
                "evidence": r.evidence,
            }
            for r in rule_results
        ],
        "network_findings": network_findings,
    }
