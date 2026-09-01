"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  getCustomer,
  getExplanation,
  getFinancialHealth,
  createApplication,
  runRiskAssessment,
} from "@/lib/api";
import type {
  CustomerDetailResponse,
  ExplanationResponse,
  FinancialHealthResponse,
  RiskAssessmentResponse,
} from "@/types/api";
import { cn, formatPKR, formatPercent } from "@/lib/utils";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ScoreGauge } from "@/components/shared/score-gauge";
import { RiskBadge } from "@/components/shared/risk-badge";
import { DecisionChip } from "@/components/shared/decision-chip";
import { ErrorState } from "@/components/shared/error-state";
import { ArrowLeft, RefreshCw, AlertTriangle, TrendingDown, Activity } from "lucide-react";

export default function CustomerPage() {
  const params = useParams();
  const id = Number(params.id);

  const [customer, setCustomer] = useState<CustomerDetailResponse | null>(null);
  const [explanation, setExplanation] = useState<ExplanationResponse | null>(null);
  const [timeline, setTimeline] = useState<FinancialHealthResponse | null>(null);
  const [assessment, setAssessment] = useState<RiskAssessmentResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [assessing, setAssessing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    loadData();
  }, [id]);

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const c = await getCustomer(id);
      setCustomer(c);

      try {
        const [exp, health] = await Promise.all([
          getExplanation(id),
          getFinancialHealth(id),
        ]);
        setExplanation(exp);
        setTimeline(health);
      } catch {
        // Explanation or timeline may not exist yet.
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load customer");
    } finally {
      setLoading(false);
    }
  }

  async function handleAssess() {
    if (!customer) return;
    setAssessing(true);
    try {
      const profile = customer.financial_profile;
      const app = await createApplication({
        customer_id: id,
        requested_amount: profile?.loan_amount || 150000,
        requested_tenure_months: profile?.loan_term || 6,
      });
      const result = await runRiskAssessment(app.id);
      setAssessment(result);
      toast.success("Risk assessment completed");

      try {
        const [exp, health] = await Promise.all([
          getExplanation(id),
          getFinancialHealth(id),
        ]);
        setExplanation(exp);
        setTimeline(health);
      } catch {}
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Assessment failed");
    } finally {
      setAssessing(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48 bg-navy-800" />
        <Skeleton className="h-64 bg-navy-800" />
      </div>
    );
  }

  if (error) {
    return <ErrorState title="Could not load customer" message={error} retry={loadData} />;
  }

  if (!customer) {
    return <ErrorState title="Customer not found" message={`No customer with ID ${id}.`} />;
  }

  const profile = customer.financial_profile;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="text-slate-400 hover:text-white hover:bg-navy-800"
          >
            <Link href="/customers">
              <ArrowLeft className="w-5 h-5" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-white">{customer.name}</h1>
            <p className="text-slate-400 text-sm mt-1">
              {customer.employment_type.replace(/_/g, " ")} — {formatPKR(customer.monthly_income)}/mo
            </p>
          </div>
        </div>
        <Button
          onClick={handleAssess}
          disabled={assessing}
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          <RefreshCw className={cn("w-4 h-4 mr-2", assessing && "animate-spin")} />
          {assessing ? "Assessing..." : assessment ? "Re-run Assessment" : "Run Risk Assessment"}
        </Button>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="bg-navy-900 border border-navy-700">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="risk">Risk & Affordability</TabsTrigger>
          <TabsTrigger value="timeline">Financial Health</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {assessment && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="bg-navy-900 border-navy-700 lg:col-span-1">
                <CardHeader>
                  <CardTitle className="text-white">CreditSense Score</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col items-center">
                  <ScoreGauge score={assessment.credit_score} size="lg" />
                  <div className="flex gap-3 mt-6">
                    <RiskBadge level={assessment.risk_level} />
                    <DecisionChip decision={assessment.decision} />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-navy-900 border-navy-700 lg:col-span-2">
                <CardHeader>
                  <CardTitle className="text-white">Assessment Summary</CardTitle>
                  <CardDescription className="text-slate-400">
                    ID #{assessment.id} · {new Date(assessment.created_at).toLocaleString()}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <SummaryItem
                      label="Repayment Probability"
                      value={
                        assessment.repayment_probability !== null
                          ? formatPercent(assessment.repayment_probability)
                          : "—"
                      }
                    />
                    <SummaryItem
                      label="Fraud Score"
                      value={assessment.fraud_score?.toFixed(3) ?? "—"}
                      highlight={assessment.fraud_flag}
                    />
                    <SummaryItem
                      label="Recommended Amount"
                      value={formatPKR(assessment.recommended_amount)}
                    />
                    <SummaryItem
                      label="Recommended Tenure"
                      value={
                        assessment.recommended_tenure_months
                          ? `${assessment.recommended_tenure_months} months`
                          : "—"
                      }
                    />
                  </div>

                  {assessment.fraud_flag && (
                    <Alert className="bg-red-500/10 border-red-500/30 text-red-300">
                      <AlertTriangle className="w-5 h-5 text-red-400" />
                      <AlertDescription>
                        Fraud indicators are elevated. Decision: {assessment.decision}.{" "}
                        <Link
                          href={`/customers/${id}/fraud-network`}
                          className="underline hover:text-red-200"
                        >
                          View fraud network →
                        </Link>
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {profile ? (
            <Card className="bg-navy-900 border-navy-700">
              <CardHeader>
                <CardTitle className="text-white">Financial Profile</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                  <ProfileItem label="Monthly Income" value={formatPKR(customer.monthly_income)} />
                  <ProfileItem label="Monthly Expenses" value={formatPKR(customer.monthly_expenses)} />
                  <ProfileItem label="Existing Debt" value={formatPKR(profile.existing_debt)} />
                  <ProfileItem label="Account Age" value={`${profile.account_age_months} months`} />
                  <ProfileItem label="Transaction Count" value={profile.transaction_count} />
                  <ProfileItem label="Avg Transaction" value={formatPKR(profile.avg_transaction)} />
                  <ProfileItem label="Digital Payment Ratio" value={formatPercent(profile.digital_payment_ratio, 0)} />
                  <ProfileItem label="Income Stability" value={formatPercent(profile.income_stability, 0)} />
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="bg-navy-900 border-navy-700">
              <CardContent className="py-12 text-center">
                <p className="text-slate-400">No financial profile on record.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="risk" className="space-y-6">
          {assessment ? (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="bg-navy-900 border-navy-700">
                  <CardHeader>
                    <CardTitle className="text-white">Explainability</CardTitle>
                    <CardDescription className="text-slate-400">
                      Factors driving the risk assessment
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {renderFactors(assessment, explanation)}
                  </CardContent>
                </Card>

                <Card className="bg-navy-900 border-navy-700">
                  <CardHeader>
                    <CardTitle className="text-white">Decision</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="flex items-center gap-4">
                      <span className="text-slate-400 text-sm">Outcome</span>
                      <DecisionChip decision={assessment.decision} />
                    </div>
                    <Separator className="bg-navy-700" />
                    <div className="space-y-3">
                      <RecommendationRow
                        label="Recommended amount"
                        value={formatPKR(assessment.recommended_amount)}
                      />
                      <RecommendationRow
                        label="Recommended tenure"
                        value={
                          assessment.recommended_tenure_months
                            ? `${assessment.recommended_tenure_months} months`
                            : "—"
                        }
                      />
                    </div>
                  </CardContent>
                </Card>
              </div>

              {assessment.fraud_flag && (
                <Card className="bg-red-500/5 border-red-500/20">
                  <CardHeader>
                    <CardTitle className="text-red-400 flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5" />
                      Fraud Risk Detected
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-slate-300">
                      This application triggered fraud alerts. Review the network graph before making
                      a final decision.
                    </p>
                    <Button asChild variant="outline" className="mt-4 border-red-500/30 text-red-300 hover:bg-red-500/10">
                      <Link href={`/customers/${id}/fraud-network`}>View Fraud Network</Link>
                    </Button>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <Card className="bg-navy-900 border-navy-700">
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
        </TabsContent>

        <TabsContent value="timeline" className="space-y-6">
          {timeline?.timeline && timeline.timeline.length > 0 ? (
            <Card className="bg-navy-900 border-navy-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Activity className="w-5 h-5" />
                  Financial Health Timeline
                </CardTitle>
                <CardDescription className="text-slate-400">
                  Seeded synthetic timeline for demonstration
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {timeline.timeline.map((point) => (
                  <div
                    key={point.month}
                    className={cn(
                      "flex items-center gap-4 p-3 rounded-lg border",
                      point.distress_flag
                        ? "bg-red-500/10 border-red-500/20"
                        : "bg-navy-800/50 border-transparent"
                    )}
                  >
                    <div className="text-sm font-medium text-slate-300 w-20">
                      Month {point.month}
                    </div>
                    <ScoreGauge score={point.credit_score} size="sm" />
                    <RiskBadge level={point.risk_level} />
                    {point.note && (
                      <div className="text-xs text-amber-300 flex items-center gap-1">
                        <TrendingDown className="w-3 h-3" />
                        {point.note}
                      </div>
                    )}
                    {point.distress_flag && (
                      <Badge variant="destructive" className="text-xs">
                        Distress
                      </Badge>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : (
            <Card className="bg-navy-900 border-navy-700">
              <CardContent className="py-12 text-center">
                <p className="text-slate-400">No timeline data available yet.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SummaryItem({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string | number;
  highlight?: boolean;
}) {
  return (
    <div className="bg-navy-800/50 rounded-lg p-4">
      <div className="text-xs text-slate-400">{label}</div>
      <div className={cn("text-white font-medium", highlight && "text-red-400")}>{value}</div>
    </div>
  );
}

function ProfileItem({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-xs text-slate-400">{label}</div>
      <div className="text-sm font-medium text-white">{value}</div>
    </div>
  );
}

function RecommendationRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-navy-700 last:border-0">
      <span className="text-sm text-slate-400">{label}</span>
      <span className="text-sm font-medium text-white">{value}</span>
    </div>
  );
}

function renderFactors(
  assessment: RiskAssessmentResponse,
  explanation: ExplanationResponse | null
) {
  const shapPositive = assessment.top_factors.filter((f) => f.direction === "positive");
  const shapNegative = assessment.top_factors.filter((f) => f.direction === "negative");

  if (shapPositive.length > 0 || shapNegative.length > 0) {
    return (
      <>
        <FactorGroup title="Positive Factors" factors={shapPositive.map((f) => f.factor)} color="green" />
        <FactorGroup title="Negative Factors" factors={shapNegative.map((f) => f.factor)} color="red" />
      </>
    );
  }

  if (explanation?.positive_factors?.length || explanation?.negative_factors?.length) {
    return (
      <>
        <FactorGroup title="Positive Factors" factors={explanation.positive_factors} color="green" />
        <FactorGroup title="Negative Factors" factors={explanation.negative_factors} color="red" />
      </>
    );
  }

  return <p className="text-slate-400 text-sm">No explanation data available.</p>;
}

function FactorGroup({
  title,
  factors,
  color,
}: {
  title: string;
  factors: string[];
  color: "green" | "red";
}) {
  if (factors.length === 0) return null;
  const colorClass =
    color === "green"
      ? "bg-green-500/10 border-green-500/30 text-green-300"
      : "bg-red-500/10 border-red-500/30 text-red-300";

  return (
    <div>
      <h3
        className={cn(
          "text-xs uppercase tracking-wider mb-2",
          color === "green" ? "text-green-400" : "text-red-400"
        )}
      >
        {title}
      </h3>
      <div className="flex flex-wrap gap-2">
        {factors.map((factor, i) => (
          <span key={i} className={cn("px-2 py-1 rounded border text-xs", colorClass)}>
            {color === "green" ? "+" : "−"} {factor}
          </span>
        ))}
      </div>
    </div>
  );
}
