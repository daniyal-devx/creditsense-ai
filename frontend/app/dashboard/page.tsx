"use client";

import { useEffect, useState } from "react";
import { getDashboardMetrics, getCustomers, runRiskAssessment, createApplication } from "@/lib/api";
import { cn, riskColor, riskBg, decisionColor, formatPKR } from "@/lib/utils";
import Link from "next/link";

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<any>(null);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [m, c] = await Promise.all([getDashboardMetrics(), getCustomers()]);
      setMetrics(m);
      setCustomers(c);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div className="flex items-center justify-center h-96 text-slate-400">Loading dashboard...</div>;
  if (error) return <div className="text-red-400 p-8">Error: {error}</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Executive Dashboard</h1>
        <p className="text-slate-400 text-sm mt-1">Portfolio risk overview</p>
      </div>

      {metrics && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard label="Total Customers" value={metrics.total_customers} />
          <MetricCard label="Applications Today" value={metrics.applications_today} />
          <MetricCard label="Approval Rate" value={`${metrics.approval_rate}%`} />
          <MetricCard label="Fraud Alerts" value={metrics.fraud_alerts_count} highlight={metrics.fraud_alerts_count > 0} />
          <MetricCard label="High Risk" value={metrics.high_risk_count} highlight={metrics.high_risk_count > 0} />
          <MetricCard label="Early Warnings" value={metrics.early_warnings} />
          <MetricCard label="Total Applications" value={metrics.total_applications} />
        </div>
      )}

      {metrics?.portfolio_risk_distribution && (
        <div className="bg-navy-900 rounded-xl border border-navy-700 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Portfolio Risk Distribution</h2>
          <div className="flex gap-6">
            {Object.entries(metrics.portfolio_risk_distribution).map(([level, count]) => (
              <div key={level} className={cn("px-4 py-3 rounded-lg border", riskBg(level))}>
                <div className={cn("text-2xl font-bold", riskColor(level))}>{count as number}</div>
                <div className="text-xs text-slate-400">{level}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-navy-900 rounded-xl border border-navy-700 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Recent Customers</h2>
        {customers.length === 0 ? (
          <p className="text-slate-400 text-sm">No customers yet. Seed the database to see data here.</p>
        ) : (
          <div className="space-y-2">
            {customers.slice(0, 10).map((c: any) => (
              <Link
                key={c.id}
                href={`/customers/${c.id}`}
                className="flex items-center justify-between p-3 rounded-lg bg-navy-800/50 hover:bg-navy-800 transition-colors"
              >
                <div>
                  <div className="text-sm font-medium text-white">{c.name}</div>
                  <div className="text-xs text-slate-400">{c.employment_type} — {formatPKR(c.monthly_income)}/mo</div>
                </div>
                <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCard({ label, value, highlight }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div className={cn(
      "bg-navy-900 rounded-xl border p-4",
      highlight ? "border-red-500/30" : "border-navy-700"
    )}>
      <div className="text-xs text-slate-400 uppercase tracking-wider">{label}</div>
      <div className={cn("text-2xl font-bold mt-1", highlight ? "text-red-400" : "text-white")}>
        {value}
      </div>
    </div>
  );
}
