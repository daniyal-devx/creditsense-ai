"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getApplications } from "@/lib/api";
import type { ApplicationResponse } from "@/types/api";
import { formatPKR } from "@/lib/utils";
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
import { Plus } from "lucide-react";

function statusVariant(status: string) {
  switch (status.toUpperCase()) {
    case "APPROVED":
      return "default";
    case "REJECTED":
      return "destructive";
    case "PENDING":
    default:
      return "secondary";
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Applications</h1>
          <p className="text-slate-400 text-sm mt-1">Loan applications and assessments</p>
        </div>
        <Button asChild className="bg-blue-600 hover:bg-blue-700 text-white">
          <Link href="/applications/new">
            <Plus className="w-4 h-4 mr-2" />
            New Application
          </Link>
        </Button>
      </div>

      {error && (
        <Alert
          variant="destructive"
          className="bg-red-500/10 border-red-500/30 text-red-300"
        >
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card className="bg-navy-900 border-navy-700">
        <CardHeader>
          <CardTitle className="text-white">All Applications</CardTitle>
          <CardDescription className="text-slate-400">
            {applications.length} application{applications.length === 1 ? "" : "s"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 bg-navy-800" />
              <Skeleton className="h-10 bg-navy-800" />
              <Skeleton className="h-10 bg-navy-800" />
            </div>
          ) : applications.length === 0 ? (
            <p className="text-slate-400 text-sm py-8 text-center">
              No applications yet.
            </p>
          ) : (
            <div className="rounded-md border border-navy-700 overflow-hidden">
              <Table>
                <TableHeader className="bg-navy-800/50">
                  <TableRow className="border-navy-700 hover:bg-transparent">
                    <TableHead className="text-slate-300">ID</TableHead>
                    <TableHead className="text-slate-300">Customer ID</TableHead>
                    <TableHead className="text-slate-300">Amount</TableHead>
                    <TableHead className="text-slate-300">Tenure</TableHead>
                    <TableHead className="text-slate-300">Status</TableHead>
                    <TableHead className="text-right text-slate-300">Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {applications.map((app) => (
                    <TableRow
                      key={app.id}
                      className="border-navy-700 hover:bg-navy-800/50"
                    >
                      <TableCell className="font-medium text-white">#{app.id}</TableCell>
                      <TableCell className="text-slate-300">#{app.customer_id}</TableCell>
                      <TableCell className="text-slate-300">
                        {formatPKR(app.requested_amount)}
                      </TableCell>
                      <TableCell className="text-slate-300">
                        {app.requested_tenure_months} months
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(app.status)}>{app.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right text-slate-400 text-sm">
                        {new Date(app.created_at).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
