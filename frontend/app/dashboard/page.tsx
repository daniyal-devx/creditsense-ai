"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getDashboardMetrics, getCustomers } from "@/lib/api";
import type { DashboardMetrics, CustomerResponse } from "@/types/api";
import { cn, riskBg, riskColor, formatPKR } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
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
  AlertTriangle,
  ArrowRight,
  Bell,
  FileText,
  Percent,
  ShieldAlert,
  TrendingUp,
  Users,
} from "lucide-react";

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
      <PageHeader title="Executive Dashboard" description="Portfolio risk overview">
        <Button asChild>
          <Link href="/applications/new">New Application</Link>
        </Button>
      </PageHeader>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
          icon={Percent}
          loading={loading}
        />
        <MetricCard
          label="High Risk"
          value={metrics?.high_risk_count}
          icon={AlertTriangle}
          tone={metrics?.high_risk_count ? "danger" : "default"}
          loading={loading}
        />
        <MetricCard
          label="Fraud Alerts"
          value={metrics?.fraud_alerts_count}
          icon={ShieldAlert}
          tone={metrics?.fraud_alerts_count ? "danger" : "default"}
          loading={loading}
        />
        <MetricCard
          label="Early Warnings"
          value={metrics?.early_warnings}
          icon={Bell}
          tone={metrics?.early_warnings ? "warning" : "default"}
          loading={loading}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Portfolio Risk Distribution</CardTitle>
            <CardDescription>Breakdown by risk band</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-24" />
            ) : metrics?.portfolio_risk_distribution ? (
              <div className="flex flex-wrap gap-3">
                {Object.entries(metrics.portfolio_risk_distribution).map(
                  ([level, count]) => (
                    <div
                      key={level}
                      className={cn(
                        "flex min-w-[100px] flex-col items-center justify-center rounded-lg border px-5 py-4",
                        riskBg(level)
                      )}
                    >
                      <span
                        className={cn(
                          "text-2xl font-semibold tabular-nums",
                          riskColor(level)
                        )}
                      >
                        {count}
                      </span>
                      <span className="mt-0.5 text-xs text-muted-foreground capitalize">
                        {level}
                      </span>
                    </div>
                  )
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No distribution data available.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button asChild variant="outline" className="w-full justify-between">
              <Link href="/customers">
                Browse customers
                <ArrowRight />
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full justify-between">
              <Link href="/applications">
                View applications
                <ArrowRight />
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full justify-between">
              <Link href="/copilot">
                Open AI Copilot
                <ArrowRight />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Customers</CardTitle>
          <CardDescription>Latest customer profiles</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          ) : customers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-muted">
                <Users className="size-5 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground">No customers yet</p>
              <p className="text-sm text-muted-foreground">
                Customer profiles appear here as applications come in.
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {customers.slice(0, 10).map((c) => (
                <Link
                  key={c.id}
                  href={`/customers/${c.id}`}
                  className="flex items-center justify-between rounded-lg p-3 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground">{c.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {c.employment_type.replace(/_/g, " ")} —{" "}
                      {formatPKR(c.monthly_income)}/mo
                    </div>
                  </div>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
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
  tone = "default",
  loading,
}: {
  label: string;
  value?: number | null;
  suffix?: string;
  icon: React.ElementType;
  tone?: "default" | "danger" | "warning";
  loading: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          {loading ? (
            <Skeleton className="mt-2 h-8 w-20" />
          ) : (
            <p
              className={cn(
                "mt-1 font-heading text-2xl font-semibold tracking-tight tabular-nums",
                tone === "danger" && "text-destructive",
                tone === "warning" && "text-warning",
                tone === "default" && "text-foreground"
              )}
            >
              {value === undefined || value === null ? "—" : `${value}${suffix ?? ""}`}
            </p>
          )}
        </div>
        <div
          className={cn(
            "rounded-lg p-2",
            tone === "danger"
              ? "bg-destructive/10 text-destructive"
              : tone === "warning"
                ? "bg-warning/10 text-warning"
                : "bg-muted text-muted-foreground"
          )}
        >
          <Icon className="size-5" />
        </div>
      </CardContent>
    </Card>
  );
}
