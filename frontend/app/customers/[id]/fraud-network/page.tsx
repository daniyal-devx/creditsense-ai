"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getFraudRisk } from "@/lib/api";
import { cn } from "@/lib/utils";

export default function FraudNetworkPage() {
  const params = useParams();
  const id = Number(params.id);

  const [fraudData, setFraudData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    loadFraudData();
  }, [id]);

  async function loadFraudData() {
    try {
      const data = await getFraudRisk(id);
      setFraudData(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div className="flex items-center justify-center h-96 text-slate-400">Loading...</div>;
  if (error) return <div className="text-red-400 p-8">Error: {error}</div>;

  const graph = fraudData?.graph_data;
  const alerts = fraudData?.fraud_alerts || [];
  const hasCluster = fraudData?.risk_cluster_detected;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Fraud Network Graph</h1>
        <p className="text-slate-400 text-sm mt-1">Customer #{id} — relationship analysis</p>
      </div>

      {hasCluster && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
          <div className="flex items-center gap-2 text-red-400 font-semibold text-lg">
            Risk Cluster Detected
          </div>
          <p className="text-sm text-red-300 mt-1">
            Multiple applicants share device fingerprints or accounts, indicating potential coordinated fraud.
          </p>
        </div>
      )}

      {alerts.length > 0 && (
        <div className="bg-navy-900 rounded-xl border border-navy-700 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Fraud Alerts</h2>
          <div className="space-y-2">
            {alerts.map((alert: any) => (
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
                  <span
                    className={cn(
                      "text-xs px-2 py-0.5 rounded font-medium",
                      alert.severity === "HIGH"
                        ? "bg-red-500/20 text-red-300"
                        : "bg-amber-500/20 text-amber-300"
                    )}
                  >
                    {alert.severity}
                  </span>
                </div>
                {alert.description && (
                  <p className="text-xs text-slate-400 mt-1">{alert.description}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {graph && graph.nodes?.length > 0 ? (
        <div className="bg-navy-900 rounded-xl border border-navy-700 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Relationship Graph</h2>
          <NetworkGraph nodes={graph.nodes} edges={graph.edges} />
        </div>
      ) : (
        <div className="bg-navy-900 rounded-xl border border-navy-700 p-6">
          <p className="text-slate-400 text-sm">No graph data available for this customer.</p>
        </div>
      )}
    </div>
  );
}

function NetworkGraph({ nodes, edges }: { nodes: any[]; edges: any[] }) {
  const nodeColors: Record<string, string> = {
    customer: "#3b82f6",
    device: "#f59e0b",
    counterparty: "#8b5cf6",
  };

  const width = 700;
  const height = 400;
  const cx = width / 2;
  const cy = height / 2;

  const positions = nodes.map((node, i) => {
    if (i === 0) return { x: cx, y: cy };
    const angle = ((i - 1) / (nodes.length - 1)) * Math.PI * 2;
    const radius = node.type === "device" ? 120 : 180;
    return {
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
    };
  });

  const nodeMap = new Map(nodes.map((n, i) => [n.id, i]));

  return (
    <svg width={width} height={height} className="mx-auto">
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
            strokeWidth={1.5}
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
              <circle cx={pos.x} cy={pos.y} r={22} fill={color} opacity={0.15} />
            )}
            <circle
              cx={pos.x}
              cy={pos.y}
              r={16}
              fill={color}
              stroke={isHighlighted ? "#ef4444" : "#1a2846"}
              strokeWidth={isHighlighted ? 3 : 2}
            />
            <text
              x={pos.x}
              y={pos.y + 30}
              textAnchor="middle"
              fill="#94a3b8"
              fontSize={10}
            >
              {node.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
