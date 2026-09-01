"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getApplication, getRiskAssessment, runRiskAssessment } from "@/lib/api";
import type { ApplicationResponse, RiskAssessmentResponse } from "@/types/api";
import { formatPKR, decisionColor, riskColor } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

function statusVariant(status: string) {
  switch (status.toUpperCase()) {
    case "APPROVED":
      return "default";
    case "REJECTED":
      return "destructive";
    default:
      return "secondary";
  }
}

export default function ApplicationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);

  const [application, setApplication] = useState<ApplicationResponse | null>(null);
  const [assessment, setAssessment] = useState<RiskAssessmentResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [assessing, setAssessing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const app = await getApplication(id);
        setApplication(app);

        try {
          const existing = await getRiskAssessment(id);
          setAssessment(existing);
        } catch {
          // No assessment yet
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load application");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  async function handleAssess() {
    setAssessing(true);
    try {
      const result = await runRiskAssessment(id);
      setAssessment(result);
      toast.success("Risk assessment completed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Assessment failed");
    } finally {
      setAssessing(false);
    }
  }

  if (loading) return <Skeleton className="h-96 bg-navy-800" />;
  if (error || !application)
    return (
      <Alert variant="destructive" className="bg-red-500/10 border-red-500/30 text-red-300">
        <AlertDescription>{error || "Application not found"}</AlertDescription>
      </Alert>
    );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">
            Application #{application.id}
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Customer #{application.customer_id} · Created{" "}
            {new Date(application.created_at).toLocaleDateString()}
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            onClick={handleAssess}
            disabled={assessing}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {assessing ? "Assessing..." : assessment ? "Re-run Assessment" : "Run Risk Assessment"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="bg-navy-900 border-navy-700 lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-white">Requested Terms</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="text-xs text-slate-400">Amount</div>
              <div className="text-lg font-medium text-white">
                {formatPKR(application.requested_amount)}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-400">Tenure</div>
              <div className="text-lg font-medium text-white">
                {application.requested_tenure_months} months
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-400">Status</div>
              <Badge variant={statusVariant(application.status)} className="mt-1">
                {application.status}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {assessment ? (
          <Card className="bg-navy-900 border-navy-700 lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-white">Risk Assessment</CardTitle>
              <CardDescription className="text-slate-400">
                ID #{assessment.id} · {new Date(assessment.created_at).toLocaleString()}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex flex-wrap items-center gap-4">
                <div>
                  <div className="text-xs text-slate-400">Credit Score</div>
                  <div className="text-4xl font-bold text-white">
                    {assessment.credit_score ?? "—"}
                    <span className="text-lg text-slate-500 font-normal">/1000</span>
                  </div>
                </div>
                <Separator orientation="vertical" className="h-12 bg-navy-700 hidden sm:block" />
                <div>
                  <div className="text-xs text-slate-400">Risk Level</div>
                  <div className={cn("text-xl font-semibold", riskColor(assessment.risk_level))}>
                    {assessment.risk_level}
                  </div>
                </div>
                <Separator orientation="vertical" className="h-12 bg-navy-700 hidden sm:block" />
                <div>
                  <div className="text-xs text-slate-400">Decision</div>
                  <span
                    className={cn(
                      "inline-block mt-1 px-3 py-1 rounded-full text-sm font-medium border",
                      decisionColor(assessment.decision)
                    )}
                  >
                    {assessment.decision}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-navy-800/50 rounded-lg p-4">
                  <div className="text-xs text-slate-400">Repayment Probability</div>
                  <div className="text-white font-medium">
                    {assessment.repayment_probability !== null
                      ? `${(assessment.repayment_probability * 100).toFixed(1)}%`
                      : "—"}
                  </div>
                </div>
                <div className="bg-navy-800/50 rounded-lg p-4">
                  <div className="text-xs text-slate-400">Fraud Score</div>
                  <div className={cn("font-medium", assessment.fraud_flag ? "text-red-400" : "text-white")}>
                    {assessment.fraud_score?.toFixed(3) ?? "—"}
                  </div>
                </div>
                <div className="bg-navy-800/50 rounded-lg p-4">
                  <div className="text-xs text-slate-400">Recommended Amount</div>
                  <div className="text-white font-medium">
                    {formatPKR(assessment.recommended_amount)}
                  </div>
                </div>
                <div className="bg-navy-800/50 rounded-lg p-4">
                  <div className="text-xs text-slate-400">Recommended Tenure</div>
                  <div className="text-white font-medium">
                    {assessment.recommended_tenure_months ?? "—"} months
                  </div>
                </div>
              </div>

              {assessment.top_factors.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-white mb-2">Top Factors</h3>
                  <div className="flex flex-wrap gap-2">
                    {assessment.top_factors.map((f, i) => (
                      <span
                        key={i}
                        className={cn(
                          "px-2 py-1 rounded border text-xs",
                          f.direction === "positive"
                            ? "bg-green-500/10 border-green-500/30 text-green-300"
                            : "bg-red-500/10 border-red-500/30 text-red-300"
                        )}
                      >
                        {f.direction === "positive" ? "+" : "−"} {f.factor}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card className="bg-navy-900 border-navy-700 lg:col-span-2">
            <CardContent className="py-12 text-center">
              <p className="text-slate-400 mb-4">No risk assessment has been run yet.</p>
              <Button
                onClick={handleAssess}
                disabled={assessing}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {assessing ? "Assessing..." : "Run Risk Assessment"}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
