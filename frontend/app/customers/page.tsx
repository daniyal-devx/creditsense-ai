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
import { Search, Plus, ArrowRight } from "lucide-react";

export default function CustomersPage() {
  const [customers, setCustomers] = useState<CustomerResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    getCustomers()
      .then(setCustomers)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load customers"))
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Customers</h1>
          <p className="text-slate-400 text-sm mt-1">
            Browse and assess applicant profiles
          </p>
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
        <CardHeader className="pb-3">
          <CardTitle className="text-white">Directory</CardTitle>
          <CardDescription className="text-slate-400">
            {filtered.length} customer{filtered.length === 1 ? "" : "s"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <Input
              placeholder="Search by name or employment type..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9 bg-navy-800 border-navy-600 text-white placeholder:text-slate-500"
            />
          </div>

          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 bg-navy-800" />
              <Skeleton className="h-10 bg-navy-800" />
              <Skeleton className="h-10 bg-navy-800" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-slate-400 text-sm py-8 text-center">
              No customers match your search.
            </p>
          ) : (
            <div className="rounded-md border border-navy-700 overflow-hidden">
              <Table>
                <TableHeader className="bg-navy-800/50">
                  <TableRow className="border-navy-700 hover:bg-transparent">
                    <TableHead className="text-slate-300">Name</TableHead>
                    <TableHead className="text-slate-300">Employment</TableHead>
                    <TableHead className="text-slate-300">Income</TableHead>
                    <TableHead className="text-slate-300">Expenses</TableHead>
                    <TableHead className="text-right text-slate-300">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((c) => (
                    <TableRow
                      key={c.id}
                      className="border-navy-700 hover:bg-navy-800/50"
                    >
                      <TableCell className="font-medium text-white">
                        {c.name}
                      </TableCell>
                      <TableCell className="text-slate-300 capitalize">
                        {c.employment_type.replace(/_/g, " ")}
                      </TableCell>
                      <TableCell className="text-slate-300">
                        {formatPKR(c.monthly_income)}
                      </TableCell>
                      <TableCell className="text-slate-300">
                        {formatPKR(c.monthly_expenses)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" asChild>
                          <Link
                            href={`/customers/${c.id}`}
                            className="text-blue-400 hover:text-blue-300"
                          >
                            View
                            <ArrowRight className="w-4 h-4 ml-1" />
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
