/**
 * The relationship graph.
 *
 * Individual fraud signals catch individual bad applications. Rings are only
 * visible in the shape of the connections *between* applications — five people
 * who each look mildly odd on their own, and unmistakable together.
 *
 * The graph links applicants by the things a fabricated identity has trouble
 * varying: the device, the address, the phone number, and the counterparties
 * money moves between. Each edge type carries a different weight, because a
 * shared device is much stronger evidence than a shared city.
 *
 * Pure functions over plain data — the layout is deterministic, so the same
 * cluster is drawn the same way every time an analyst opens it. A graph that
 * rearranges itself on refresh is one nobody can reason about or point at
 * during a call.
 */

export type EdgeType =
  | 'device'
  | 'address'
  | 'phone_prefix'
  | 'counterparty'
  | 'money_transfer'

export interface GraphNode {
  id: string
  label: string
  /** `applicant` for a customer, `entity` for a device/address/counterparty. */
  kind: 'applicant' | 'entity'
  entityType?: EdgeType
  /** Fraud risk score, when the node is an applicant. */
  riskScore?: number
  /** Credit score, when the node is an applicant. */
  creditScore?: number
  city?: string
  /** Set for the applicant the analyst opened. */
  isFocus?: boolean
  /** Deterministic layout position, 0–1 in both axes. */
  x: number
  y: number
}

export interface GraphEdge {
  id: string
  source: string
  target: string
  type: EdgeType
  /** 0–1. How strongly this edge implies a real relationship. */
  weight: number
  label: string
}

export interface RelationshipGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
  /** Connected components with more than one applicant. */
  clusters: GraphCluster[]
  focusCustomerId: string | null
}

export interface GraphCluster {
  id: string
  customerIds: string[]
  /** 0–1. How tightly connected, weighted by edge strength. */
  cohesion: number
  /** The edge types holding it together, strongest first. */
  linkTypes: EdgeType[]
  /** Why this cluster looks like a ring, in plain language. */
  assessment: string
  severity: 'critical' | 'high' | 'medium' | 'low'
}

/**
 * Edge weights.
 *
 * A shared device is near-conclusive that two applications came from the same
 * hands. A shared phone prefix is nearly meaningless on its own — it is
 * included only because it strengthens a cluster already held together by
 * something else.
 */
export const EDGE_WEIGHTS: Record<EdgeType, number> = {
  device: 0.95,
  address: 0.7,
  money_transfer: 0.6,
  counterparty: 0.45,
  phone_prefix: 0.1,
}

export const EDGE_LABELS: Record<EdgeType, string> = {
  device: 'Same device',
  address: 'Same address',
  money_transfer: 'Money moved between them',
  counterparty: 'Shared counterparty',
  phone_prefix: 'Same number range',
}

export interface GraphInput {
  applicants: {
    id: string
    fullName: string
    city: string
    deviceFingerprint: string | null
    address: string | null
    phone: string
    riskScore?: number
    creditScore?: number
  }[]
  /** Direct transfers observed between two applicants. */
  transfers: { fromCustomerId: string; toCustomerId: string; count: number; total: number }[]
  /** Counterparty references and the applicants who transact with them. */
  sharedCounterparties: { ref: string; customerIds: string[] }[]
  focusCustomerId?: string
}

/** Normalise an address enough to match two spellings of the same place. */
function normaliseAddress(address: string | null): string | null {
  if (!address) return null
  const cleaned = address
    .toLowerCase()
    .replace(/[.,#-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  // Too short to be meaningful — matching on "Lahore" would link a third of
  // the population.
  return cleaned.length < 12 ? null : cleaned
}

export function buildRelationshipGraph(input: GraphInput): RelationshipGraph {
  const nodes = new Map<string, GraphNode>()
  const edges: GraphEdge[] = []

  for (const applicant of input.applicants) {
    nodes.set(applicant.id, {
      id: applicant.id,
      label: applicant.fullName,
      kind: 'applicant',
      riskScore: applicant.riskScore,
      creditScore: applicant.creditScore,
      city: applicant.city,
      isFocus: applicant.id === input.focusCustomerId,
      x: 0,
      y: 0,
    })
  }

  // ---- device ----
  const byDevice = new Map<string, string[]>()
  for (const applicant of input.applicants) {
    if (!applicant.deviceFingerprint) continue
    const list = byDevice.get(applicant.deviceFingerprint)
    if (list) list.push(applicant.id)
    else byDevice.set(applicant.deviceFingerprint, [applicant.id])
  }
  for (const [fingerprint, ids] of byDevice) {
    if (ids.length < 2) continue
    // Link every pair rather than routing through a hub node: the analyst
    // needs to see that A and C are connected, not just that both touch a
    // device node.
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        edges.push({
          id: `device:${fingerprint}:${ids[i]}:${ids[j]}`,
          source: ids[i],
          target: ids[j],
          type: 'device',
          weight: EDGE_WEIGHTS.device,
          label: EDGE_LABELS.device,
        })
      }
    }
  }

  // ---- address ----
  const byAddress = new Map<string, string[]>()
  for (const applicant of input.applicants) {
    const key = normaliseAddress(applicant.address)
    if (!key) continue
    const list = byAddress.get(key)
    if (list) list.push(applicant.id)
    else byAddress.set(key, [applicant.id])
  }
  for (const [key, ids] of byAddress) {
    if (ids.length < 2) continue
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        edges.push({
          id: `address:${key.slice(0, 20)}:${ids[i]}:${ids[j]}`,
          source: ids[i],
          target: ids[j],
          type: 'address',
          weight: EDGE_WEIGHTS.address,
          label: EDGE_LABELS.address,
        })
      }
    }
  }

  // ---- direct transfers ----
  for (const transfer of input.transfers) {
    if (!nodes.has(transfer.fromCustomerId) || !nodes.has(transfer.toCustomerId)) continue
    edges.push({
      id: `transfer:${transfer.fromCustomerId}:${transfer.toCustomerId}`,
      source: transfer.fromCustomerId,
      target: transfer.toCustomerId,
      type: 'money_transfer',
      weight: EDGE_WEIGHTS.money_transfer,
      label: `${transfer.count} transfers · Rs ${Math.round(transfer.total).toLocaleString()}`,
    })
  }

  // ---- shared counterparties ----
  for (const shared of input.sharedCounterparties) {
    const ids = shared.customerIds.filter((id) => nodes.has(id))
    if (ids.length < 2) continue
    // A counterparty touching a large number of applicants is a merchant, not
    // evidence. Linking every pair would connect half the portfolio.
    if (ids.length > 6) continue

    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        edges.push({
          id: `cp:${shared.ref}:${ids[i]}:${ids[j]}`,
          source: ids[i],
          target: ids[j],
          type: 'counterparty',
          weight: EDGE_WEIGHTS.counterparty,
          label: EDGE_LABELS.counterparty,
        })
      }
    }
  }

  const clusters = findClusters([...nodes.values()], edges)
  const positioned = layout([...nodes.values()], edges, clusters, input.focusCustomerId)

  return {
    nodes: positioned,
    edges,
    clusters,
    focusCustomerId: input.focusCustomerId ?? null,
  }
}

/**
 * Connected components, by union-find.
 *
 * Only edges above a weight floor are used for clustering: linking on shared
 * phone prefix alone would merge unrelated people into one giant component and
 * bury the real rings.
 */
function findClusters(nodes: GraphNode[], edges: GraphEdge[]): GraphCluster[] {
  const CLUSTER_EDGE_FLOOR = 0.4

  const parent = new Map<string, string>()
  const find = (id: string): string => {
    const p = parent.get(id)
    if (!p || p === id) return id
    const root = find(p)
    parent.set(id, root)
    return root
  }
  const union = (a: string, b: string) => {
    const rootA = find(a)
    const rootB = find(b)
    if (rootA !== rootB) parent.set(rootA, rootB)
  }

  for (const node of nodes) parent.set(node.id, node.id)
  for (const edge of edges) {
    if (edge.weight < CLUSTER_EDGE_FLOOR) continue
    union(edge.source, edge.target)
  }

  const groups = new Map<string, string[]>()
  for (const node of nodes) {
    if (node.kind !== 'applicant') continue
    const root = find(node.id)
    const list = groups.get(root)
    if (list) list.push(node.id)
    else groups.set(root, [node.id])
  }

  const clusters: GraphCluster[] = []

  for (const [root, members] of groups) {
    if (members.length < 2) continue

    const memberSet = new Set(members)
    const internal = edges.filter(
      (e) => memberSet.has(e.source) && memberSet.has(e.target) && e.weight >= CLUSTER_EDGE_FLOOR,
    )

    // Cohesion: how close this group is to being fully connected, weighted by
    // edge strength. A tight ring approaches 1; a chain of acquaintances does
    // not.
    const possiblePairs = (members.length * (members.length - 1)) / 2
    const weightedEdges = internal.reduce((sum, e) => sum + e.weight, 0)
    const cohesion = possiblePairs > 0 ? Math.min(1, weightedEdges / possiblePairs) : 0

    const linkTypes = [...new Set(internal.map((e) => e.type))].sort(
      (a, b) => EDGE_WEIGHTS[b] - EDGE_WEIGHTS[a],
    )

    const hasDevice = linkTypes.includes('device')
    const hasMoney = linkTypes.includes('money_transfer')

    const severity: GraphCluster['severity'] =
      hasDevice && hasMoney && members.length >= 3
        ? 'critical'
        : (hasDevice && members.length >= 3) || (hasMoney && cohesion > 0.6)
          ? 'high'
          : members.length >= 3
            ? 'medium'
            : 'low'

    clusters.push({
      id: `cluster:${root}`,
      customerIds: members,
      cohesion: Number(cohesion.toFixed(2)),
      linkTypes,
      severity,
      assessment: describeCluster(members.length, linkTypes, cohesion, hasDevice, hasMoney),
    })
  }

  return clusters.sort((a, b) => b.customerIds.length - a.customerIds.length)
}

function describeCluster(
  size: number,
  linkTypes: EdgeType[],
  cohesion: number,
  hasDevice: boolean,
  hasMoney: boolean,
): string {
  const links = linkTypes.map((t) => EDGE_LABELS[t].toLowerCase()).join(', ')

  if (hasDevice && hasMoney && size >= 3) {
    return `${size} applicants share a device AND move money between themselves. Together those two facts are very hard to explain innocently — this has the shape of a coordinated ring, not a coincidence.`
  }
  if (hasDevice && size >= 3) {
    return `${size} applicants applied from the same device. That can be a shared family phone or an agent filling forms on behalf of customers, but at this size it needs explaining before any of them is approved.`
  }
  if (hasMoney && cohesion > 0.6) {
    return `${size} applicants move money between each other in a tightly connected group. Circulating funds inside a closed group inflates everyone's apparent turnover.`
  }
  return `${size} applicants are connected by ${links}. Worth a look, but each link on its own has an innocent explanation.`
}

/**
 * Deterministic radial layout.
 *
 * Not a force simulation: those are non-deterministic, expensive, and give a
 * different picture every time the page loads — which makes a graph useless as
 * evidence. Here the focus applicant sits at the centre, their direct
 * connections form a ring around them, and everything else sits further out,
 * with positions derived from a hash of the node id so the arrangement is
 * stable across sessions and machines.
 */
function layout(
  nodes: GraphNode[],
  edges: GraphEdge[],
  clusters: GraphCluster[],
  focusId?: string,
): GraphNode[] {
  const adjacency = new Map<string, Set<string>>()
  for (const edge of edges) {
    if (!adjacency.has(edge.source)) adjacency.set(edge.source, new Set())
    if (!adjacency.has(edge.target)) adjacency.set(edge.target, new Set())
    adjacency.get(edge.source)!.add(edge.target)
    adjacency.get(edge.target)!.add(edge.source)
  }

  // Breadth-first distance from the focus node.
  const depth = new Map<string, number>()
  if (focusId && adjacency.has(focusId)) {
    depth.set(focusId, 0)
    const queue = [focusId]
    while (queue.length > 0) {
      const current = queue.shift()!
      const currentDepth = depth.get(current)!
      for (const neighbour of adjacency.get(current) ?? []) {
        if (depth.has(neighbour)) continue
        depth.set(neighbour, currentDepth + 1)
        queue.push(neighbour)
      }
    }
  }

  // Group by ring, ordered by id so the arrangement never changes.
  const rings = new Map<number, string[]>()
  for (const node of nodes) {
    const d = depth.get(node.id) ?? (focusId ? 3 : 1)
    const list = rings.get(d)
    if (list) list.push(node.id)
    else rings.set(d, [node.id])
  }
  for (const list of rings.values()) list.sort()

  const positioned = new Map<string, { x: number; y: number }>()

  for (const [ring, ids] of rings) {
    if (ring === 0) {
      positioned.set(ids[0], { x: 0.5, y: 0.5 })
      continue
    }

    const radius = Math.min(0.44, 0.16 * ring + 0.06)
    ids.forEach((id, index) => {
      // Offset each ring so nodes do not line up radially and overlap.
      const angle = (index / ids.length) * Math.PI * 2 + ring * 0.7
      positioned.set(id, {
        x: 0.5 + radius * Math.cos(angle),
        y: 0.5 + radius * Math.sin(angle),
      })
    })
  }

  const clusterOf = new Map<string, string>()
  for (const cluster of clusters) {
    for (const id of cluster.customerIds) clusterOf.set(id, cluster.id)
  }

  return nodes.map((node) => ({
    ...node,
    ...(positioned.get(node.id) ?? { x: 0.5, y: 0.5 }),
  }))
}

/** Everything connected to one applicant, for the focused investigation view. */
export function subgraphAround(
  graph: RelationshipGraph,
  customerId: string,
  maxDepth = 2,
): RelationshipGraph {
  const adjacency = new Map<string, Set<string>>()
  for (const edge of graph.edges) {
    if (!adjacency.has(edge.source)) adjacency.set(edge.source, new Set())
    if (!adjacency.has(edge.target)) adjacency.set(edge.target, new Set())
    adjacency.get(edge.source)!.add(edge.target)
    adjacency.get(edge.target)!.add(edge.source)
  }

  const included = new Set<string>([customerId])
  let frontier = [customerId]

  for (let d = 0; d < maxDepth; d++) {
    const next: string[] = []
    for (const id of frontier) {
      for (const neighbour of adjacency.get(id) ?? []) {
        if (included.has(neighbour)) continue
        included.add(neighbour)
        next.push(neighbour)
      }
    }
    frontier = next
    if (frontier.length === 0) break
  }

  const nodes = graph.nodes.filter((n) => included.has(n.id))
  const edges = graph.edges.filter((e) => included.has(e.source) && included.has(e.target))
  const clusters = graph.clusters.filter((c) => c.customerIds.some((id) => included.has(id)))

  return {
    nodes: layout(nodes, edges, clusters, customerId),
    edges,
    clusters,
    focusCustomerId: customerId,
  }
}
