"""Graph service — Module 4: relationship graph with NetworkX.

The DB-dependent functions assume the current `backend.models` schema. They will
be updated in Wave 2 once the Supabase schema (`graph_entities` and
`graph_relationships`) is in place.
"""
from typing import Dict, Iterable, List, Tuple

import networkx as nx
from sqlalchemy.orm import Session

from backend.models import Customer, FinancialProfile, Transaction
from backend.services.fraud.network import build_graph_metrics, detect_rings


def check_risk_cluster(customer_id: int, db: Session) -> dict:
    """Return whether the customer is part of a risk cluster.

    Currently uses the device fingerprint on `FinancialProfile`; in Wave 2 this
    will query `graph_relationships` directly.
    """
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        return {"cluster_detected": False}

    profile = customer.financial_profile
    if not profile or not profile.device_fingerprint:
        return {"cluster_detected": False}

    same_device = (
        db.query(Customer)
        .join(FinancialProfile)
        .filter(
            FinancialProfile.device_fingerprint == profile.device_fingerprint,
            Customer.id != customer_id,
        )
        .all()
    )

    if len(same_device) >= 2:
        cluster_ids = [customer_id] + [c.id for c in same_device]
        cluster_members = [c.name for c in [customer] + same_device]
        return {
            "cluster_detected": True,
            "description": (
                f"Risk cluster detected: {len(cluster_ids)} customers sharing "
                f"device fingerprint '{profile.device_fingerprint}'"
            ),
            "cluster_size": len(cluster_ids),
            "cluster_members": cluster_members,
            "rings": detect_rings(
                [(c.id, "DEVICE", profile.device_fingerprint) for c in [customer] + same_device]
            ),
        }

    return {"cluster_detected": False}


def build_customer_graph(customer_id: int, db: Session) -> dict:
    """Build a node/edge payload for the customer relationship graph."""
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        return {"nodes": [], "edges": [], "metrics": {}}

    relationships: List[Tuple[int, str, int]] = []
    G = nx.Graph()
    G.add_node(
        f"customer_{customer_id}",
        label=customer.name,
        type="customer",
        highlighted=True,
    )

    profile = customer.financial_profile
    if profile and profile.device_fingerprint:
        device_node = f"device_{profile.device_fingerprint}"
        G.add_node(
            device_node,
            label=f"Device: {profile.device_fingerprint[:8]}",
            type="device",
        )
        G.add_edge(f"customer_{customer_id}", device_node, type="uses_device")
        relationships.append((customer_id, "DEVICE", profile.device_fingerprint))

        same_device = (
            db.query(Customer)
            .join(FinancialProfile)
            .filter(
                FinancialProfile.device_fingerprint == profile.device_fingerprint,
                Customer.id != customer_id,
            )
            .all()
        )
        for c in same_device:
            c_node = f"customer_{c.id}"
            G.add_node(c_node, label=c.name, type="customer", highlighted=True)
            G.add_edge(c_node, device_node, type="uses_device")
            relationships.append((c.id, "DEVICE", profile.device_fingerprint))

    txns = db.query(Transaction).filter(Transaction.customer_id == customer_id).limit(50).all()
    counterparties = set()
    for t in txns:
        if t.counterparty_id:
            counterparties.add(t.counterparty_id)

    for cp_id in list(counterparties)[:10]:
        cp_node = f"counterparty_{cp_id}"
        G.add_node(cp_node, label=f"CP: {cp_id}", type="counterparty")
        G.add_edge(f"customer_{customer_id}", cp_node, type="transacts")

    nodes = []
    for node_id, data in G.nodes(data=True):
        nodes.append({
            "id": node_id,
            "label": data.get("label", node_id),
            "type": data.get("type", "unknown"),
            "highlighted": data.get("highlighted", False),
        })

    edges = []
    for u, v, data in G.edges(data=True):
        edges.append({
            "source": u,
            "target": v,
            "type": data.get("type", "connected"),
            "weight": data.get("weight", 1.0),
        })

    return {
        "nodes": nodes,
        "edges": edges,
        "metrics": build_graph_metrics(relationships),
        "rings": detect_rings(relationships),
    }


def analyze_relationships(relationships: Iterable[Tuple[int, str, int]]) -> Dict:
    """Pure-graph analysis of customer-entity relationships without DB access."""
    rings = detect_rings(relationships)
    metrics = build_graph_metrics(relationships)
    return {
        "rings": rings,
        "metrics": metrics,
        "cluster_detected": len(rings) > 0,
    }
