"""Tests for the graph risk service."""
from backend.services.graph_service import analyze_relationships


def test_analyze_relationships_finds_ring_and_metrics():
    relationships = [
        (1, "DEVICE", 101),
        (2, "DEVICE", 101),
        (3, "DEVICE", 101),
        (1, "MERCHANT", 202),
        (2, "MERCHANT", 202),
        (3, "MERCHANT", 202),
    ]
    result = analyze_relationships(relationships)

    assert result["cluster_detected"] is True
    assert len(result["rings"]) == 1
    assert result["metrics"]["component_count"] == 1


def test_analyze_relationships_no_ring():
    relationships = [
        (1, "DEVICE", 101),
        (2, "DEVICE", 102),
        (3, "DEVICE", 103),
    ]
    result = analyze_relationships(relationships)

    assert result["cluster_detected"] is False
    assert result["metrics"]["component_count"] == 3
