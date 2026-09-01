"""Network/graph fraud detection helpers."""
from collections import defaultdict
from typing import Dict, Iterable, List, Set, Tuple


def detect_rings(
    relationships: Iterable[Tuple[int, str, int]],
    min_customers: int = 3,
    shared_entities_threshold: int = 1,
) -> List[Dict]:
    """Detect rings of customers sharing non-customer entities.

    Args:
        relationships: tuples of (customer_id, entity_type, entity_id).
        min_customers: minimum customers to call a ring.
        shared_entities_threshold: minimum shared entities required.

    Returns:
        A list of ring findings, each with customer_ids, shared_entities and evidence.
    """
    # Map (entity_type, entity_id) -> set of customer_ids
    entity_to_customers: Dict[Tuple[str, int], Set[int]] = defaultdict(set)
    for customer_id, entity_type, entity_id in relationships:
        entity_to_customers[(entity_type, entity_id)].add(customer_id)

    # For each customer, collect entities they touch
    customer_to_entities: Dict[int, Set[Tuple[str, int]]] = defaultdict(set)
    for (entity_type, entity_id), customers in entity_to_customers.items():
        for customer_id in customers:
            customer_to_entities[customer_id].add((entity_type, entity_id))

    rings = []
    seen_groups = set()

    for (entity_type, entity_id), customers in entity_to_customers.items():
        if len(customers) < min_customers:
            continue

        # Find additional entities shared by at least these customers
        candidate_customers = list(customers)
        shared_entities = {(entity_type, entity_id)}
        for other_entity, other_customers in entity_to_customers.items():
            if customers.issubset(other_customers):
                shared_entities.add(other_entity)

        if len(shared_entities) < shared_entities_threshold:
            continue

        group_key = tuple(sorted(candidate_customers))
        if group_key in seen_groups:
            continue
        seen_groups.add(group_key)

        rings.append({
            "customer_ids": candidate_customers,
            "shared_entities": [
                {"entity_type": et, "entity_id": eid} for et, eid in sorted(shared_entities)
            ],
            "evidence": {
                "min_customers": min_customers,
                "shared_entities_threshold": shared_entities_threshold,
            },
        })

    return rings


def build_graph_metrics(relationships: Iterable[Tuple[int, str, int]]) -> Dict:
    """Return basic connected-component metrics for the customer-entity graph."""
    import networkx as nx

    G = nx.Graph()
    for customer_id, entity_type, entity_id in relationships:
        entity_node = f"{entity_type}:{entity_id}"
        G.add_edge(f"c:{customer_id}", entity_node)

    components = list(nx.connected_components(G))
    component_sizes = [len(c) for c in components]

    return {
        "node_count": G.number_of_nodes(),
        "edge_count": G.number_of_edges(),
        "component_count": len(components),
        "largest_component_size": max(component_sizes) if component_sizes else 0,
        "avg_component_size": (sum(component_sizes) / len(component_sizes)) if component_sizes else 0.0,
    }
