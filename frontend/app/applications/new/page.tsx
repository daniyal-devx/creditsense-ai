"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getCustomers, createApplication } from "@/lib/api";
import type { CustomerResponse } from "@/types/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

export default function NewApplicationPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<CustomerResponse[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [customerId, setCustomerId] = useState<string>("");
  const [amount, setAmount] = useState<string>("150000");
  const [tenure, setTenure] = useState<string>("12");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getCustomers()
      .then(setCustomers)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load customers"))
      .finally(() => setLoadingCustomers(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!customerId) {
      setError("Please select a customer");
      return;
    }

    setSubmitting(true);
    try {
      const app = await createApplication({
        customer_id: Number(customerId),
        requested_amount: Number(amount),
        requested_tenure_months: Number(tenure),
      });
      toast.success("Application created");
      router.push(`/applications/${app.id}`);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to create application";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">New Application</h1>
        <p className="text-slate-400 text-sm mt-1">Create a loan application for a customer</p>
      </div>

      <Card className="bg-navy-900 border-navy-700">
        <CardHeader>
          <CardTitle className="text-white">Application Details</CardTitle>
          <CardDescription className="text-slate-400">
            Select the customer and requested terms
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert
              variant="destructive"
              className="mb-4 bg-red-500/10 border-red-500/30 text-red-300"
            >
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {loadingCustomers ? (
            <Skeleton className="h-32 bg-navy-800" />
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="customer" className="text-slate-300">
                  Customer
                </Label>
                <Select value={customerId} onValueChange={(v) => setCustomerId(v ?? "")}>
                  <SelectTrigger
                    id="customer"
                    className="bg-navy-800 border-navy-600 text-white"
                  >
                    <SelectValue placeholder="Select a customer" />
                  </SelectTrigger>
                  <SelectContent className="bg-navy-800 border-navy-600 text-white">
                    {customers.map((c) => (
                      <SelectItem
                        key={c.id}
                        value={String(c.id)}
                        className="focus:bg-navy-700 focus:text-white"
                      >
                        {c.name} — {c.employment_type.replace(/_/g, " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="amount" className="text-slate-300">
                  Requested Amount (PKR)
                </Label>
                <Input
                  id="amount"
                  type="number"
                  min={1000}
                  step={1000}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                  className="bg-navy-800 border-navy-600 text-white"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="tenure" className="text-slate-300">
                  Tenure (months)
                </Label>
                <Input
                  id="tenure"
                  type="number"
                  min={1}
                  max={60}
                  value={tenure}
                  onChange={(e) => setTenure(e.target.value)}
                  required
                  className="bg-navy-800 border-navy-600 text-white"
                />
              </div>

              <div className="pt-2 flex gap-3">
                <Button
                  type="submit"
                  disabled={submitting}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {submitting ? "Creating..." : "Create Application"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.back()}
                  className="border-navy-600 text-slate-300 hover:bg-navy-800 hover:text-white"
                >
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
