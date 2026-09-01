"use client";

import { useEffect, useState } from "react";
import { getModelMetrics } from "@/lib/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

interface CalibrationPoint {
  bin: string;
  mean_predicted: number;
  observed_rate: number;
  count: number;
}

interface ModelMetrics {
  model_type?: string;
  dataset_rows?: number;
  roc_auc?: number;
  pr_auc?: number;
  accuracy?: number;
  precision?: number;
  recall?: number;
  f1?: number;
  brier_score?: number;
  log_loss?: number;
  ks_statistic?: number;
  cv_roc_auc_mean?: number;
  val_roc_auc?: number;
  confusion_matrix?: {
    true_negatives: number;
    false_positives: number;
    false_negatives: number;
    true_positives: number;
  };
  calibration?: CalibrationPoint[];
  feature_cols?: string[];
  categorical_cols?: string[];
  generated_at?: string;
}

function MetricCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="bg-navy-800/50 rounded-lg p-4">
      <div className="text-xs text-slate-400 uppercase tracking-wider">{label}</div>
      <div className="text-2xl font-bold text-white mt-1">{value}</div>
    </div>
  );
}

export default function ModelMetricsPage() {
  const [metrics, setMetrics] = useState<ModelMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getModelMetrics()
      .then((data) => setMetrics(data as ModelMetrics))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load metrics"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64 bg-navy-800" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24 bg-navy-800" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="bg-red-500/10 border-red-500/30 text-red-300">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  const cm = metrics?.confusion_matrix;
  const calibration = metrics?.calibration ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Model Metrics</h1>
        <p className="text-slate-400 text-sm mt-1">
          {metrics?.model_type?.replace(/_/g, " ")} · {metrics?.dataset_rows} rows ·{" "}
          {metrics?.generated_at
            ? new Date(metrics.generated_at).toLocaleDateString()
            : ""}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="ROC-AUC" value={metrics?.roc_auc?.toFixed(4) ?? "—"} />
        <MetricCard label="PR-AUC" value={metrics?.pr_auc?.toFixed(4) ?? "—"} />
        <MetricCard label="Accuracy" value={metrics?.accuracy?.toFixed(4) ?? "—"} />
        <MetricCard label="F1 Score" value={metrics?.f1?.toFixed(4) ?? "—"} />
        <MetricCard label="Precision" value={metrics?.precision?.toFixed(4) ?? "—"} />
        <MetricCard label="Recall" value={metrics?.recall?.toFixed(4) ?? "—"} />
        <MetricCard label="Brier Score" value={metrics?.brier_score?.toFixed(4) ?? "—"} />
        <MetricCard label="Log Loss" value={metrics?.log_loss?.toFixed(4) ?? "—"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-navy-900 border-navy-700">
          <CardHeader>
            <CardTitle className="text-white">Confusion Matrix</CardTitle>
            <CardDescription className="text-slate-400">
              Test set classification outcomes
            </CardDescription>
          </CardHeader>
          <CardContent>
            {cm ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold text-green-400">{cm.true_negatives}</div>
                  <div className="text-xs text-green-300 mt-1">True Negatives</div>
                </div>
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold text-red-400">{cm.false_positives}</div>
                  <div className="text-xs text-red-300 mt-1">False Positives</div>
                </div>
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold text-red-400">{cm.false_negatives}</div>
                  <div className="text-xs text-red-300 mt-1">False Negatives</div>
                </div>
                <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold text-green-400">{cm.true_positives}</div>
                  <div className="text-xs text-green-300 mt-1">True Positives</div>
                </div>
              </div>
            ) : (
              <p className="text-slate-400 text-sm">No confusion matrix available.</p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-navy-900 border-navy-700">
          <CardHeader>
            <CardTitle className="text-white">Calibration</CardTitle>
            <CardDescription className="text-slate-400">
              Mean predicted probability vs. observed default rate
            </CardDescription>
          </CardHeader>
          <CardContent>
            {calibration.length > 0 ? (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
                    <CartesianGrid stroke="#1a2846" strokeDasharray="3 3" />
                    <XAxis
                      type="number"
                      dataKey="mean_predicted"
                      name="Predicted"
                      domain={[0, 1]}
                      tick={{ fill: "#94a3b8", fontSize: 12 }}
                      stroke="#334155"
                      label={{
                        value: "Predicted probability",
                        position: "insideBottom",
                        offset: -5,
                        fill: "#94a3b8",
                        fontSize: 12,
                      }}
                    />
                    <YAxis
                      type="number"
                      dataKey="observed_rate"
                      name="Observed"
                      domain={[0, 1]}
                      tick={{ fill: "#94a3b8", fontSize: 12 }}
                      stroke="#334155"
                      label={{
                        value: "Observed rate",
                        angle: -90,
                        position: "insideLeft",
                        fill: "#94a3b8",
                        fontSize: 12,
                      }}
                    />
                    <Tooltip
                      cursor={{ strokeDasharray: "3 3" }}
                      contentStyle={{
                        backgroundColor: "#0d1423",
                        border: "1px solid #273c69",
                        borderRadius: "8px",
                        color: "#e2e8f0",
                      }}
                      formatter={(_, __, props) => {
                        const p = props?.payload as CalibrationPoint;
                        return [
                          `Predicted: ${p.mean_predicted.toFixed(3)}, Observed: ${p.observed_rate.toFixed(3)}`,
                          `Count: ${p.count}`,
                        ];
                      }}
                    />
                    <ReferenceLine
                      segment={[
                        { x: 0, y: 0 },
                        { x: 1, y: 1 },
                      ]}
                      stroke="#4164af"
                      strokeDasharray="4 4"
                    />
                    <Scatter
                      data={calibration}
                      fill="#3b82f6"
                      shape="circle"
                    />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-slate-400 text-sm">No calibration data available.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="bg-navy-900 border-navy-700">
        <CardHeader>
          <CardTitle className="text-white">Feature Columns</CardTitle>
          <CardDescription className="text-slate-400">
            Inputs used by the trained model
          </CardDescription>
        </CardHeader>
        <CardContent>
          {metrics?.feature_cols ? (
            <div className="rounded-md border border-navy-700 overflow-hidden">
              <Table>
                <TableHeader className="bg-navy-800/50">
                  <TableRow className="border-navy-700 hover:bg-transparent">
                    <TableHead className="text-slate-300">Feature</TableHead>
                    <TableHead className="text-slate-300">Type</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {metrics.feature_cols.map((col) => (
                    <TableRow
                      key={col}
                      className="border-navy-700 hover:bg-navy-800/50"
                    >
                      <TableCell className="text-white font-mono text-sm">{col}</TableCell>
                      <TableCell className="text-slate-300 text-sm">
                        {metrics.categorical_cols?.includes(col) ? "Categorical" : "Numeric"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-slate-400 text-sm">No feature information available.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
