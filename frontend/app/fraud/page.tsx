"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getDashboardMetrics } from "@/lib/api";
import type { DashboardMetrics } from "@/types/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ShieldAlert, AlertTriangle, Users } from "lucide-react";

export default function FraudQueuePage() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDashboardMetrics()
      .then(setMetrics)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <ShieldAlert className="w-6 h-6 text-red-400" />
          Fraud Queue
        </h1>
        <p className="text-slate-400 text-sm mt-1">Review flagged applications and risk clusters</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          label="Open Fraud Alerts"
          value={metrics?.fraud_alerts_count}
          loading={loading}
          highlight
        />
        <StatCard
          label="High Risk Customers"
          value={metrics?.high_risk_count}
          loading={loading}
          highlight
        />
        <StatCard
          label="Customers Reviewed"
          value={metrics?.total_customers}
          loading={loading}
        />
      </div>

      <Alert className="bg-amber-500/10 border-amber-500/20 text-amber-200">
        <AlertTriangle className="w-5 h-5 text-amber-400" />
        <AlertDescription>
          A dedicated fraud queue endpoint will be added once the Supabase schema migration (Wave 2)
          is complete. For now, inspect individual customers via the customer detail page.
        </AlertDescription>
      </Alert>

      <Card className="bg-navy-900 border-navy-700">
        <CardHeader>
          <CardTitle className="text-white">Queue</CardTitle>
          <CardDescription className="text-slate-400">
            Flagged items awaiting analyst review
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <ShieldAlert className="w-12 h-12 text-slate-600 mb-4" />
            <h3 className="text-lg font-semibold text-white mb-1">Queue integration pending</h3>
            <p className="text-slate-400 text-sm max-w-md mb-6">
              The backend fraud queue endpoint is planned for Wave 5/8. Use the customer fraud
              network view for immediate review.
            </p>
            <Button asChild className="bg-blue-600 hover:bg-blue-700 text-white">
              <Link href="/customers">
                <Users className="w-4 h-4 mr-2" />
                Browse Customers
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  label,
  value,
  loading,
  highlight,
}: {
  label: string;
  value?: number | null;
  loading: boolean;
  highlight?: boolean;
}) {
  return (
    <Card className={cn("bg-navy-900", highlight ? "border-red-500/30" : "border-navy-700")}>
      <CardContent className="p-5">
        <p className="text-xs text-slate-400 uppercase tracking-wider">{label}</p>
        {loading ? (
          <Skeleton className="h-8 w-16 mt-2 bg-navy-800" />
        ) : (
          <p className={cn("text-2xl font-bold mt-1", highlight ? "text-red-400" : "text-white")}>
            {value ?? "—"}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

