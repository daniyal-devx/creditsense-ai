"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getCustomers } from "@/lib/api";
import type { CustomerResponse } from "@/types/api";
import { formatPKR } from "@/lib/utils";
import { Input } from "@/components/ui/input";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PageHeader } from "@/components/shared/page-header";
import { ArrowRight, Plus, Search, Users } from "lucide-react";

export default function CustomersPage() {
  const [customers, setCustomers] = useState<CustomerResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    getCustomers()
      .then(setCustomers)
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Failed to load customers")
      )
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.employment_type.toLowerCase().includes(q)
    );
  }, [customers, query]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customers"
        description="Browse and assess applicant profiles"
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
          <CardTitle>Directory</CardTitle>
          <CardDescription>
            {loading
              ? "Loading customers…"
              : `${filtered.length} customer${filtered.length === 1 ? "" : "s"}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name or employment type..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-muted">
                <Users className="size-5 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground">
                {query ? "No customers match your search" : "No customers yet"}
              </p>
              <p className="text-sm text-muted-foreground">
                {query
                  ? "Try a different name or employment type."
                  : "Customer profiles appear here as applications come in."}
              </p>
              {!query && (
                <Button asChild variant="outline" className="mt-4">
                  <Link href="/applications/new">
                    <Plus className="mr-2 size-4" />
                    Create your first application
                  </Link>
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Name</TableHead>
                    <TableHead>Employment</TableHead>
                    <TableHead>Income</TableHead>
                    <TableHead>Expenses</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium text-foreground">
                        {c.name}
                      </TableCell>
                      <TableCell className="text-muted-foreground capitalize">
                        {c.employment_type.replace(/_/g, " ")}
                      </TableCell>
                      <TableCell className="text-muted-foreground tabular-nums">
                        {formatPKR(c.monthly_income)}
                      </TableCell>
                      <TableCell className="text-muted-foreground tabular-nums">
                        {formatPKR(c.monthly_expenses)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/customers/${c.id}`}>
                            View
                            <ArrowRight className="ml-1 size-4" />
                          </Link>
                        </Button>
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
