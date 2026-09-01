"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getDashboardMetrics, getCustomers } from "@/lib/api";
import type { DashboardMetrics, CustomerResponse } from "@/types/api";
import { cn, riskBg, riskColor, formatPKR } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowRight, Users, FileText, AlertTriangle, TrendingUp } from "lucide-react";

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [customers, setCustomers] = useState<CustomerResponse[]>([]);
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Executive Dashboard</h1>
          <p className="text-slate-400 text-sm mt-1">Portfolio risk overview</p>
        </div>
        <Button asChild className="bg-blue-600 hover:bg-blue-700 text-white">
          <Link href="/applications/new">New Application</Link>
        </Button>
      </div>

      {error && (
        <Alert variant="destructive" className="bg-red-500/10 border-red-500/30 text-red-300">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Total Customers"
          value={metrics?.total_customers}
          icon={Users}
          loading={loading}
        />
        <MetricCard
          label="Total Applications"
          value={metrics?.total_applications}
          icon={FileText}
          loading={loading}
        />
        <MetricCard
          label="Applications Today"
          value={metrics?.applications_today}
          icon={TrendingUp}
          loading={loading}
        />
        <MetricCard
          label="Approval Rate"
          value={metrics?.approval_rate}
          suffix="%"
          icon={TrendingUp}
          loading={loading}
        />
        <MetricCard
          label="High Risk"
          value={metrics?.high_risk_count}
          icon={AlertTriangle}
          highlight={metrics?.high_risk_count ? metrics.high_risk_count > 0 : false}
          loading={loading}
        />
        <MetricCard
          label="Fraud Alerts"
          value={metrics?.fraud_alerts_count}
          icon={AlertTriangle}
          highlight={metrics?.fraud_alerts_count ? metrics.fraud_alerts_count > 0 : false}
          loading={loading}
        />
        <MetricCard
          label="Early Warnings"
          value={metrics?.early_warnings}
          icon={AlertTriangle}
          loading={loading}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="bg-navy-900 border-navy-700 lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-white">Portfolio Risk Distribution</CardTitle>
            <CardDescription className="text-slate-400">
              Breakdown by risk band
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-24 bg-navy-800" />
            ) : metrics?.portfolio_risk_distribution ? (
              <div className="flex flex-wrap gap-3">
                {Object.entries(metrics.portfolio_risk_distribution).map(([level, count]) => (
                  <div
                    key={level}
                    className={cn(
                      "flex flex-col items-center justify-center px-5 py-4 rounded-xl border min-w-[100px]",
                      riskBg(level)
                    )}
                  >
                    <span className={cn("text-2xl font-bold", riskColor(level))}>
                      {count}
                    </span>
                    <span className="text-xs text-slate-400 capitalize">{level}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-400 text-sm">No distribution data available.</p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-navy-900 border-navy-700">
          <CardHeader>
            <CardTitle className="text-white">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button asChild variant="outline" className="w-full justify-between border-navy-600 text-slate-300 hover:bg-navy-800 hover:text-white">
              <Link href="/customers">
                Browse customers
                <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full justify-between border-navy-600 text-slate-300 hover:bg-navy-800 hover:text-white">
              <Link href="/applications">
                View applications
                <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full justify-between border-navy-600 text-slate-300 hover:bg-navy-800 hover:text-white">
              <Link href="/copilot">
                Open AI Copilot
                <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-navy-900 border-navy-700">
        <CardHeader>
          <CardTitle className="text-white">Recent Customers</CardTitle>
          <CardDescription className="text-slate-400">
            Latest customer profiles
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 bg-navy-800" />
              <Skeleton className="h-12 bg-navy-800" />
              <Skeleton className="h-12 bg-navy-800" />
            </div>
          ) : customers.length === 0 ? (
            <p className="text-slate-400 text-sm py-8 text-center">
              No customers yet. Seed the database to see data here.
            </p>
          ) : (
            <div className="space-y-2">
              {customers.slice(0, 10).map((c) => (
                <Link
                  key={c.id}
                  href={`/customers/${c.id}`}
                  className="flex items-center justify-between p-3 rounded-lg bg-navy-800/50 hover:bg-navy-800 transition-colors"
                >
                  <div>
                    <div className="text-sm font-medium text-white">{c.name}</div>
                    <div className="text-xs text-slate-400">
                      {c.employment_type.replace(/_/g, " ")} — {formatPKR(c.monthly_income)}/mo
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-500" />
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({
  label,
  value,
  suffix,
  icon: Icon,
  highlight,
  loading,
}: {
  label: string;
  value?: number | null;
  suffix?: string;
  icon: React.ElementType;
  highlight?: boolean;
  loading: boolean;
}) {
  return (
    <Card className={cn("bg-navy-900", highlight ? "border-red-500/30" : "border-navy-700")}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wider">{label}</p>
            {loading ? (
              <Skeleton className="h-8 w-20 mt-2 bg-navy-800" />
            ) : (
              <p
                className={cn(
                  "text-2xl font-bold mt-1",
                  highlight ? "text-red-400" : "text-white"
                )}
              >
                {value === undefined || value === null ? "—" : `${value}${suffix ?? ""}`}
              </p>
            )}
          </div>
          <div
            className={cn(
              "p-2 rounded-lg",
              highlight ? "bg-red-500/10" : "bg-navy-800"
            )}
          >
            <Icon className={cn("w-5 h-5", highlight ? "text-red-400" : "text-slate-400")} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
