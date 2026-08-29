'use client'

import * as React from 'react'
import { Maximize2, Minus, Plus, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EDGE_LABELS, type GraphEdge, type GraphNode, type RelationshipGraph } from '@/lib/fraud/graph'

/**
 * The relationship graph.
 *
 * Desktop gets a pan-and-zoom canvas. Mobile gets the same canvas plus a
 * tap-to-inspect node list underneath — because a graph on a 320px screen is
 * genuinely hard to use, and an analyst on a phone needs to be able to read
 * the connections as a list rather than pinching at dots. Both views are
 * driven by the same selection state, so tapping a name in the list highlights
 * the node and vice versa.
 *
 * Rendered as SVG rather than canvas: the graphs here are tens of nodes, not
 * thousands, and SVG gives real DOM elements that can be focused, labelled for
 * a screen reader, and hit-tested by the browser rather than by hand.
 */

const EDGE_STYLE: Record<string, { stroke: string; dash?: string; width: number }> = {
  device: { stroke: 'var(--danger)', width: 2.5 },
  money_transfer: { stroke: 'var(--warning)', width: 2 },
  address: { stroke: 'var(--chart-6)', width: 2, dash: '5 3' },
  counterparty: { stroke: 'var(--border-strong)', width: 1.5, dash: '3 3' },
  phone_prefix: { stroke: 'var(--border)', width: 1, dash: '2 4' },
}

function riskColour(score: number | undefined): string {
  if (score === undefined) return 'var(--muted-foreground)'
  if (score >= 70) return 'var(--risk-veryhigh)'
  if (score >= 45) return 'var(--risk-high)'
  if (score >= 20) return 'var(--risk-moderate)'
  return 'var(--risk-low)'
}

export function RelationshipGraphView({
  graph,
  onSelectNode,
  className,
}: {
  graph: RelationshipGraph
  onSelectNode?: (customerId: string) => void
  className?: string
}) {
  const [selected, setSelected] = React.useState<string | null>(graph.focusCustomerId)
  const [zoom, setZoom] = React.useState(1)
  const [pan, setPan] = React.useState({ x: 0, y: 0 })
  const dragState = React.useRef<{ x: number; y: number; panX: number; panY: number } | null>(null)

  const SIZE = 600
  const PADDING = 60

  const project = React.useCallback(
    (node: GraphNode) => ({
      x: PADDING + node.x * (SIZE - PADDING * 2),
      y: PADDING + node.y * (SIZE - PADDING * 2),
    }),
    [],
  )

  const nodeById = React.useMemo(
    () => new Map(graph.nodes.map((n) => [n.id, n])),
    [graph.nodes],
  )

  // Which nodes are directly connected to the selection — used to fade the
  // rest so a dense graph still reads.
  const connected = React.useMemo(() => {
    if (!selected) return new Set<string>()
    const set = new Set<string>([selected])
    for (const edge of graph.edges) {
      if (edge.source === selected) set.add(edge.target)
      if (edge.target === selected) set.add(edge.source)
    }
    return set
  }, [selected, graph.edges])

  const select = (id: string) => {
    setSelected(id)
    onSelectNode?.(id)
  }

  const reset = () => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }

  const onPointerDown = (e: React.PointerEvent) => {
    dragState.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y }
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragState.current
    if (!drag) return
    setPan({
      x: drag.panX + (e.clientX - drag.x) / zoom,
      y: drag.panY + (e.clientY - drag.y) / zoom,
    })
  }

  const onPointerUp = () => {
    dragState.current = null
  }

  const applicants = graph.nodes.filter((n) => n.kind === 'applicant')

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {/* ---------- canvas ---------- */}
      <div className="relative overflow-hidden rounded-xl border border-border bg-surface-sunken">
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="h-auto w-full touch-none select-none"
          style={{ aspectRatio: '1 / 1', maxHeight: '70vh' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          role="img"
          aria-label={`Relationship graph with ${applicants.length} applicants and ${graph.edges.length} connections. A list of the same connections follows.`}
        >
          <g transform={`translate(${SIZE / 2} ${SIZE / 2}) scale(${zoom}) translate(${-SIZE / 2 + pan.x} ${-SIZE / 2 + pan.y})`}>
            {/* Edges first, so nodes sit on top of them. */}
            {graph.edges.map((edge) => {
              const source = nodeById.get(edge.source)
              const target = nodeById.get(edge.target)
              if (!source || !target) return null

              const a = project(source)
              const b = project(target)
              const style = EDGE_STYLE[edge.type] ?? EDGE_STYLE.counterparty
              const dimmed = selected !== null && !(connected.has(edge.source) && connected.has(edge.target))

              return (
                <line
                  key={edge.id}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={style.stroke}
                  strokeWidth={style.width}
                  strokeDasharray={style.dash}
                  opacity={dimmed ? 0.1 : 0.65}
                  className="transition-opacity duration-200"
                />
              )
            })}

            {graph.nodes.map((node) => {
              const { x, y } = project(node)
              const isSelected = node.id === selected
              const dimmed = selected !== null && !connected.has(node.id)
              const radius = node.isFocus ? 18 : isSelected ? 16 : 12

              return (
                <g
                  key={node.id}
                  transform={`translate(${x} ${y})`}
                  opacity={dimmed ? 0.22 : 1}
                  className="cursor-pointer transition-opacity duration-200"
                  onClick={(e) => {
                    e.stopPropagation()
                    select(node.id)
                  }}
                  tabIndex={0}
                  role="button"
                  aria-label={`${node.label}${node.riskScore !== undefined ? `, fraud risk ${node.riskScore}` : ''}`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      select(node.id)
                    }
                  }}
                >
                  {node.isFocus && (
                    <circle r={radius + 6} fill="none" stroke="var(--primary)" strokeWidth={2} opacity={0.5} />
                  )}
                  <circle
                    r={radius}
                    fill={riskColour(node.riskScore)}
                    stroke={isSelected ? 'var(--foreground)' : 'var(--surface)'}
                    strokeWidth={isSelected ? 3 : 2}
                  />
                  <text
                    y={radius + 14}
                    textAnchor="middle"
                    className="pointer-events-none fill-foreground text-[11px] font-medium"
                  >
                    {node.label.split(' ')[0]}
                  </text>
                </g>
              )
            })}
          </g>
        </svg>

        {/* Controls. Real buttons rather than gestures only, because pinch and
            scroll-wheel zoom are unusable with a keyboard. */}
        <div className="absolute right-3 top-3 flex flex-col gap-1.5">
          <Button
            variant="secondary"
            size="icon-sm"
            aria-label="Zoom in"
            onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
          >
            <Plus className="size-4" />
          </Button>
          <Button
            variant="secondary"
            size="icon-sm"
            aria-label="Zoom out"
            onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
          >
            <Minus className="size-4" />
          </Button>
          <Button variant="secondary" size="icon-sm" aria-label="Reset view" onClick={reset}>
            <RotateCcw className="size-4" />
          </Button>
        </div>

        <p className="pointer-events-none absolute bottom-3 left-3 text-xs text-muted-foreground">
          Drag to pan · tap a node to focus
        </p>
      </div>

      {/* ---------- legend ---------- */}
      <ul className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
        {(Object.keys(EDGE_STYLE) as (keyof typeof EDGE_STYLE)[])
          .filter((type) => graph.edges.some((e) => e.type === type))
          .map((type) => {
            const style = EDGE_STYLE[type]
            return (
              <li key={type} className="flex items-center gap-1.5 text-muted-foreground">
                <svg width="18" height="4" aria-hidden="true">
                  <line
                    x1="0"
                    y1="2"
                    x2="18"
                    y2="2"
                    stroke={style.stroke}
                    strokeWidth={style.width}
                    strokeDasharray={style.dash}
                  />
                </svg>
                {EDGE_LABELS[type as keyof typeof EDGE_LABELS]}
              </li>
            )
          })}
      </ul>

      {/* ---------- the mobile fallback, and the accessible view ----------
          Always rendered, not hidden on desktop: an analyst reading down a
          list of connections is often faster than clicking nodes, and it is
          the only usable view for a screen reader. */}
      <div>
        <h3 className="mb-2 text-sm font-semibold">
          Connections {selected && `for ${nodeById.get(selected)?.label ?? ''}`}
        </h3>
        <NodeConnectionList
          graph={graph}
          selected={selected}
          onSelect={select}
          nodeById={nodeById}
        />
      </div>
    </div>
  )
}

function NodeConnectionList({
  graph,
  selected,
  onSelect,
  nodeById,
}: {
  graph: RelationshipGraph
  selected: string | null
  onSelect: (id: string) => void
  nodeById: Map<string, GraphNode>
}) {
  const focusId = selected ?? graph.focusCustomerId

  const connections = React.useMemo(() => {
    if (!focusId) return []
    const byNeighbour = new Map<string, GraphEdge[]>()
    for (const edge of graph.edges) {
      const other =
        edge.source === focusId ? edge.target : edge.target === focusId ? edge.source : null
      if (!other) continue
      const list = byNeighbour.get(other)
      if (list) list.push(edge)
      else byNeighbour.set(other, [edge])
    }
    return [...byNeighbour.entries()]
      .map(([id, edges]) => ({
        node: nodeById.get(id),
        edges,
        strength: Math.max(...edges.map((e) => e.weight)),
      }))
      .filter((c) => c.node)
      .sort((a, b) => b.strength - a.strength)
  }, [focusId, graph.edges, nodeById])

  if (connections.length === 0) {
    return (
      <p className="rounded-lg border border-border bg-surface p-4 text-sm text-muted-foreground">
        No connections to other applicants.
      </p>
    )
  }

  return (
    <ul className="flex flex-col gap-2">
      {connections.map(({ node, edges }) => (
        <li key={node!.id}>
          <button
            type="button"
            onClick={() => onSelect(node!.id)}
            className="flex w-full min-h-11 items-center gap-3 rounded-lg border border-border bg-surface p-3 text-left transition-colors hover:bg-accent"
          >
            <span
              className="size-3 shrink-0 rounded-full"
              style={{ backgroundColor: riskColour(node!.riskScore) }}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{node!.label}</span>
              <span className="mt-0.5 flex flex-wrap gap-1.5">
                {edges.map((edge) => (
                  <Badge
                    key={edge.id}
                    tone={
                      edge.type === 'device'
                        ? 'danger'
                        : edge.type === 'money_transfer'
                          ? 'warning'
                          : 'neutral'
                    }
                    size="sm"
                  >
                    {EDGE_LABELS[edge.type]}
                  </Badge>
                ))}
              </span>
            </span>
            {node!.riskScore !== undefined && (
              <span className="shrink-0 text-sm font-semibold tabular-nums">
                {node!.riskScore}
              </span>
            )}
          </button>
        </li>
      ))}
    </ul>
  )
}

/** A compact non-interactive preview for a card. */
export function GraphPreview({ graph }: { graph: RelationshipGraph }) {
  const applicants = graph.nodes.filter((n) => n.kind === 'applicant')

  return (
    <div className="flex items-center gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
        <Maximize2 className="size-4 text-muted-foreground" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium">
          {applicants.length} connected {applicants.length === 1 ? 'applicant' : 'applicants'}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {graph.edges.length} {graph.edges.length === 1 ? 'link' : 'links'}
          {graph.clusters.length > 0 &&
            ` · ${graph.clusters.length} ${graph.clusters.length === 1 ? 'cluster' : 'clusters'}`}
        </p>
      </div>
    </div>
  )
}
