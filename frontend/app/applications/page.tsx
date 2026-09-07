"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getApplications } from "@/lib/api";
import type { ApplicationResponse } from "@/types/api";
import { cn, formatPKR } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PageHeader } from "@/components/shared/page-header";
import { ArrowRight, FileText, Plus } from "lucide-react";

function statusTone(status?: string | null): {
  className: string;
  label: string;
} {
  switch (status?.toUpperCase()) {
    case "APPROVED":
      return {
        className:
          "border-success/30 bg-success/10 text-success",
        label: "Approved",
      };
    case "REJECTED":
    case "DECLINED":
      return {
        className:
          "border-destructive/30 bg-destructive/10 text-destructive",
        label: "Declined",
      };
    case "REVIEW":
    case "MANUAL_REVIEW":
      return {
        className:
          "border-warning/30 bg-warning/10 text-warning",
        label: "Review",
      };
    case "PENDING":
    default:
      return {
        className: "border-border bg-muted text-muted-foreground",
        label: "Pending",
      };
  }
}

export default function ApplicationsPage() {
  const [applications, setApplications] = useState<ApplicationResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getApplications()
      .then(setApplications)
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Failed to load applications")
      )
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Applications"
        description="Loan applications and risk assessments"
      >
        <Button asChild>
          <Link href="/applications/new">
            <Plus className="mr-2 size-4" />
            New Application
          </Link>
        </Button>
      </PageHeader>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>All Applications</CardTitle>
          <CardDescription>
            {loading
              ? "Loading applications…"
              : `${applications.length} application${applications.length === 1 ? "" : "s"}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
          ) : applications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-muted">
                <FileText className="size-5 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground">
                No applications yet
              </p>
              <p className="text-sm text-muted-foreground">
                Start a new application to generate a risk assessment.
              </p>
              <Button asChild variant="outline" className="mt-4">
                <Link href="/applications/new">
                  <Plus className="mr-2 size-4" />
                  Create your first application
                </Link>
              </Button>
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow className="hover:bg-transparent">
                    <TableHead>ID</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Tenure</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {applications.map((app) => {
                    const tone = statusTone(app.status);
                    return (
                      <TableRow key={app.id}>
                        <TableCell className="font-medium tabular-nums text-foreground">
                          #{app.id}
                        </TableCell>
                        <TableCell className="text-muted-foreground tabular-nums">
                          #{app.customer_id}
                        </TableCell>
                        <TableCell className="text-muted-foreground tabular-nums">
                          {formatPKR(app.requested_amount)}
                        </TableCell>
                        <TableCell className="text-muted-foreground tabular-nums">
                          {app.requested_tenure_months} mo
                        </TableCell>
                        <TableCell>
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize",
                              tone.className
                            )}
                          >
                            {tone.label}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" asChild>
                            <Link href={`/customers/${app.customer_id}`}>
                              View
                              <ArrowRight className="ml-1 size-4" />
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
