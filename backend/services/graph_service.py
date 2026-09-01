"""Graph service — Module 4: relationship graph with NetworkX."""
import networkx as nx
from sqlalchemy.orm import Session
from backend.models import Customer, FinancialProfile, Transaction


def check_risk_cluster(customer_id: int, db: Session) -> dict:
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
        return {
            "cluster_detected": True,
            "description": f"Risk cluster detected: {len(cluster_ids)} customers sharing device fingerprint '{profile.device_fingerprint}'",
            "cluster_size": len(cluster_ids),
            "cluster_members": [c.name for c in [customer] + same_device],
        }

    return {"cluster_detected": False}


def build_customer_graph(customer_id: int, db: Session) -> dict:
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        return {"nodes": [], "edges": []}

    G = nx.Graph()
    G.add_node(f"customer_{customer_id}", label=customer.name, type="customer", highlighted=True)

    profile = customer.financial_profile
    if profile and profile.device_fingerprint:
        G.add_node(f"device_{profile.device_fingerprint}", label=f"Device: {profile.device_fingerprint[:8]}", type="device")
        G.add_edge(f"customer_{customer_id}", f"device_{profile.device_fingerprint}", type="uses_device")

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
            G.add_edge(c_node, f"device_{profile.device_fingerprint}", type="uses_device")

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

    return {"nodes": nodes, "edges": edges}
