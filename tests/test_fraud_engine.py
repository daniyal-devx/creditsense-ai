"""Tests for the FraudSense engine."""
from types import SimpleNamespace

from backend.services.fraud.engine import detect_fraud
from backend.services.fraud.network import build_graph_metrics, detect_rings


def _application():
    return SimpleNamespace(requested_amount=50_000, requested_tenure_months=12)


def test_clean_customer_has_no_fraud_flag():
    features = {
        "suspicious_transaction_count": 0,
        "connected_accounts": 2,
        "cashflow_volatility": 0.2,
        "digital_payment_ratio": 0.5,
        "transaction_count": 50,
        "avg_transaction": 500,
        "monthly_income": 50_000,
    }
    result = detect_fraud(features, _application())

    assert result["fraud_flag"] is False
    assert result["fraud_score"] < 0.2
    assert result["alerts"] == []


def test_suspicious_transactions_trigger_flag():
    features = {
        "suspicious_transaction_count": 5,
        "connected_accounts": 2,
        "cashflow_volatility": 0.2,
        "digital_payment_ratio": 0.5,
        "transaction_count": 50,
        "avg_transaction": 500,
        "monthly_income": 50_000,
    }
    result = detect_fraud(features, _application())

    assert result["fraud_flag"] is True
    assert any(a["type"] == "SUSPICIOUS_TRANSACTIONS" for a in result["alerts"])
    assert result["components"]["rules"] == 0.30


def test_unusual_transaction_size_relative_to_income():
    features = {
        "suspicious_transaction_count": 0,
        "connected_accounts": 2,
        "cashflow_volatility": 0.2,
        "digital_payment_ratio": 0.5,
        "transaction_count": 10,
        "avg_transaction": 50_000,
        "monthly_income": 50_000,
    }
    result = detect_fraud(features, _application())

    assert any(a["type"] == "UNUSUAL_TRANSACTION_SIZE" for a in result["alerts"])


def test_ring_detection_forces_high_network_score():
    features = {
        "suspicious_transaction_count": 0,
        "connected_accounts": 2,
        "cashflow_volatility": 0.2,
        "digital_payment_ratio": 0.5,
        "transaction_count": 50,
        "avg_transaction": 500,
        "monthly_income": 50_000,
    }
    relationships = [
        (1, "DEVICE", 101),
        (2, "DEVICE", 101),
        (3, "DEVICE", 101),
        (1, "MERCHANT", 202),
        (2, "MERCHANT", 202),
        (3, "MERCHANT", 202),
    ]
    result = detect_fraud(features, _application(), relationships=relationships)

    assert result["fraud_flag"] is True
    assert result["components"]["network"] == 0.8
    assert any(a["type"] == "RISK_RING" for a in result["alerts"])


def test_detect_rings_ignores_small_groups():
    relationships = [
        (1, "DEVICE", 101),
        (2, "DEVICE", 101),
    ]
    rings = detect_rings(relationships)

    assert rings == []


def test_detect_rings_finds_three_customer_ring():
    relationships = [
        (1, "DEVICE", 101),
        (2, "DEVICE", 101),
        (3, "DEVICE", 101),
    ]
    rings = detect_rings(relationships)

    assert len(rings) == 1
    assert sorted(rings[0]["customer_ids"]) == [1, 2, 3]
    assert rings[0]["shared_entities"][0]["entity_type"] == "DEVICE"


def test_graph_metrics():
    relationships = [
        (1, "DEVICE", 101),
        (2, "DEVICE", 101),
        (3, "DEVICE", 102),
    ]
    metrics = build_graph_metrics(relationships)

    assert metrics["node_count"] == 5  # 3 customers + 2 entities
    assert metrics["edge_count"] == 3
    assert metrics["component_count"] == 2
