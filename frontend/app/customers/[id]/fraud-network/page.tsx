"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getFraudRisk } from "@/lib/api";
import type { FraudRiskResponse, GraphNode, GraphEdge } from "@/types/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ErrorState } from "@/components/shared/error-state";
import { ArrowLeft, AlertTriangle, Network } from "lucide-react";

export default function FraudNetworkPage() {
  const params = useParams();
  const id = Number(params.id);

  const [fraudData, setFraudData] = useState<FraudRiskResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    loadFraudData();
  }, [id]);

  async function loadFraudData() {
    setLoading(true);
    setError("");
    try {
      const data = await getFraudRisk(id);
      setFraudData(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load fraud data");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48 bg-navy-800" />
        <Skeleton className="h-64 bg-navy-800" />
      </div>
    );
  }

  if (error) {
    return <ErrorState title="Could not load fraud network" message={error} retry={loadFraudData} />;
  }

  const graph = fraudData?.graph_data;
  const alerts = fraudData?.fraud_alerts || [];
  const hasCluster = fraudData?.risk_cluster_detected;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="text-slate-400 hover:text-white hover:bg-navy-800"
          >
            <Link href={`/customers/${id}`}>
              <ArrowLeft className="w-5 h-5" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Network className="w-6 h-6 text-blue-400" />
              Fraud Network Graph
            </h1>
            <p className="text-slate-400 text-sm mt-1">Customer #{id} — relationship analysis</p>
          </div>
        </div>
      </div>

      {hasCluster && (
        <Alert className="bg-red-500/10 border-red-500/30 text-red-300">
          <AlertTriangle className="w-5 h-5 text-red-400" />
          <AlertDescription>
            Risk cluster detected: multiple applicants share device fingerprints or accounts,
            indicating potential coordinated fraud.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="bg-navy-900 border-navy-700 lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-white">Fraud Alerts</CardTitle>
            <CardDescription className="text-slate-400">
              {alerts.length} alert{alerts.length === 1 ? "" : "s"} triggered
            </CardDescription>
          </CardHeader>
          <CardContent>
            {alerts.length === 0 ? (
              <p className="text-slate-400 text-sm">No fraud alerts for this customer.</p>
            ) : (
              <div className="space-y-2">
                {alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className={cn(
                      "p-3 rounded-lg border",
                      alert.severity === "HIGH"
                        ? "bg-red-500/10 border-red-500/30"
                        : "bg-amber-500/10 border-amber-500/30"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-white">{alert.alert_type}</span>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-xs",
                          alert.severity === "HIGH"
                            ? "border-red-500/30 text-red-300"
                            : "border-amber-500/30 text-amber-300"
                        )}
                      >
                        {alert.severity}
                      </Badge>
                    </div>
                    {alert.description && (
                      <p className="text-xs text-slate-400 mt-1">{alert.description}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-navy-900 border-navy-700 lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-white">Relationship Graph</CardTitle>
            <CardDescription className="text-slate-400">
              Customers, devices, and counterparties
            </CardDescription>
          </CardHeader>
          <CardContent>
            {graph && graph.nodes.length > 0 ? (
              <NetworkGraph nodes={graph.nodes} edges={graph.edges} />
            ) : (
              <p className="text-slate-400 text-sm">No graph data available for this customer.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function NetworkGraph({ nodes, edges }: { nodes: GraphNode[]; edges: GraphEdge[] }) {
  const nodeColors: Record<string, string> = {
    customer: "#3b82f6",
    device: "#f59e0b",
    counterparty: "#8b5cf6",
  };

  const width = 700;
  const height = 420;
  const cx = width / 2;
  const cy = height / 2;

  const positions = nodes.map((node, i) => {
    if (i === 0) return { x: cx, y: cy };
    const angle = ((i - 1) / (nodes.length - 1)) * Math.PI * 2;
    const radius = node.type === "device" ? 120 : 190;
    return {
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
    };
  });

  const nodeMap = new Map(nodes.map((n, i) => [n.id, i]));

  return (
    <div className="overflow-auto">
      <svg
        width={width}
        height={height}
        className="mx-auto bg-navy-950/50 rounded-lg border border-navy-700"
      >
        {edges.map((edge, i) => {
          const si = nodeMap.get(edge.source);
          const ti = nodeMap.get(edge.target);
          if (si === undefined || ti === undefined) return null;
          const s = positions[si];
          const t = positions[ti];
          return (
            <line
              key={i}
              x1={s.x}
              y1={s.y}
              x2={t.x}
              y2={t.y}
              stroke="#4a5568"
              strokeWidth={edge.weight ? Math.max(1, edge.weight * 2) : 1.5}
              strokeDasharray={edge.type === "uses_device" ? "4,4" : "none"}
            />
          );
        })}
        {nodes.map((node, i) => {
          const pos = positions[i];
          const color = nodeColors[node.type] || "#6b7280";
          const isHighlighted = node.highlighted;
          return (
            <g key={node.id}>
              {isHighlighted && (
                <circle cx={pos.x} cy={pos.y} r={24} fill={color} opacity={0.15} />
              )}
              <circle
                cx={pos.x}
                cy={pos.y}
                r={16}
                fill={color}
                stroke={isHighlighted ? "#ef4444" : "#1a2846"}
                strokeWidth={isHighlighted ? 3 : 2}
              />
              <text x={pos.x} y={pos.y + 34} textAnchor="middle" fill="#94a3b8" fontSize={10}>
                {node.label}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="flex flex-wrap gap-4 mt-4 justify-center">
        {Object.entries(nodeColors).map(([type, color]) => (
          <div key={type} className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-xs text-slate-400 capitalize">{type}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
