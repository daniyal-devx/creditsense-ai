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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ScoreGauge } from "@/components/shared/score-gauge";
import { RiskBadge } from "@/components/shared/risk-badge";
import { DecisionChip } from "@/components/shared/decision-chip";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  RefreshCw,
  TrendingDown,
} from "lucide-react";

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
      } catch {
        // Non-fatal — explanation/timeline may not yet be generated.
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Assessment failed");
    } finally {
      setAssessing(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64" />
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
      <div>
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="-ml-2 mb-2 text-muted-foreground"
        >
          <Link href="/customers">
            <ArrowLeft className="mr-2 size-4" />
            Back to customers
          </Link>
        </Button>
        <PageHeader
          title={customer.name}
          description={`${customer.employment_type.replace(/_/g, " ")} — ${formatPKR(customer.monthly_income)}/mo`}
        >
          <Button onClick={handleAssess} disabled={assessing}>
            <RefreshCw
              className={cn("mr-2 size-4", assessing && "animate-spin")}
            />
            {assessing
              ? "Assessing…"
              : assessment
                ? "Re-run Assessment"
                : "Run Risk Assessment"}
          </Button>
        </PageHeader>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="risk">Risk &amp; Affordability</TabsTrigger>
          <TabsTrigger value="timeline">Financial Health</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {assessment && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <Card className="lg:col-span-1">
                <CardHeader>
                  <CardTitle>CreditSense Score</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col items-center">
                  <ScoreGauge score={assessment.credit_score} size="lg" />
                  <div className="mt-6 flex gap-3">
                    <RiskBadge level={assessment.risk_level} />
                    <DecisionChip decision={assessment.decision} />
                  </div>
                </CardContent>
              </Card>

              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Assessment Summary</CardTitle>
                  <CardDescription>
                    ID #{assessment.id} ·{" "}
                    {new Date(assessment.created_at).toLocaleString()}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
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
                    <Alert variant="destructive">
                      <AlertTriangle className="size-5" />
                      <AlertTitle>Fraud indicators elevated</AlertTitle>
                      <AlertDescription>
                        Decision: {assessment.decision}.{" "}
                        <Link
                          href={`/customers/${id}/fraud-network`}
                          className="underline hover:text-foreground"
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
            <Card>
              <CardHeader>
                <CardTitle>Financial Profile</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
                  <ProfileItem
                    label="Monthly Income"
                    value={formatPKR(customer.monthly_income)}
                  />
                  <ProfileItem
                    label="Monthly Expenses"
                    value={formatPKR(customer.monthly_expenses)}
                  />
                  <ProfileItem
                    label="Existing Debt"
                    value={formatPKR(profile.existing_debt)}
                  />
                  <ProfileItem
                    label="Account Age"
                    value={`${profile.account_age_months} months`}
                  />
                  <ProfileItem
                    label="Transaction Count"
                    value={profile.transaction_count}
                  />
                  <ProfileItem
                    label="Avg Transaction"
                    value={formatPKR(profile.avg_transaction)}
                  />
                  <ProfileItem
                    label="Digital Payment Ratio"
                    value={formatPercent(profile.digital_payment_ratio, 0)}
                  />
                  <ProfileItem
                    label="Income Stability"
                    value={formatPercent(profile.income_stability, 0)}
                  />
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-sm text-muted-foreground">
                  No financial profile on record.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="risk" className="space-y-6">
          {assessment ? (
            <>
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Explainability</CardTitle>
                    <CardDescription>
                      Factors driving the risk assessment
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {renderFactors(assessment, explanation)}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Decision</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="flex items-center gap-4">
                      <span className="text-sm text-muted-foreground">
                        Outcome
                      </span>
                      <DecisionChip decision={assessment.decision} />
                    </div>
                    <Separator />
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
                <Card className="border-destructive/30">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-destructive">
                      <AlertTriangle className="size-5" />
                      Fraud Risk Detected
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      This application triggered fraud alerts. Review the network
                      graph before making a final decision.
                    </p>
                    <Button asChild variant="outline" className="border-destructive/30 text-destructive hover:bg-destructive/10">
                      <Link href={`/customers/${id}/fraud-network`}>
                        View Fraud Network
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-muted">
                  <Activity className="size-5 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-foreground">
                  No risk assessment yet
                </p>
                <p className="mb-4 text-sm text-muted-foreground">
                  Run an assessment to see explainability, decision, and fraud signals.
                </p>
                <Button onClick={handleAssess} disabled={assessing}>
                  {assessing ? "Assessing…" : "Run Risk Assessment"}
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="timeline" className="space-y-6">
          {timeline?.timeline && timeline.timeline.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="size-5" />
                  Financial Health Timeline
                </CardTitle>
                <CardDescription>
                  Month-by-month credit trajectory with distress flags
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {timeline.timeline.map((point) => (
                  <div
                    key={point.month}
                    className={cn(
                      "flex items-center gap-4 rounded-lg border p-3",
                      point.distress_flag
                        ? "border-destructive/30 bg-destructive/10"
                        : "border-border bg-muted/40"
                    )}
                  >
                    <div className="w-20 text-sm font-medium text-muted-foreground">
                      Month {point.month}
                    </div>
                    <ScoreGauge score={point.credit_score} size="sm" />
                    <RiskBadge level={point.risk_level} />
                    {point.note && (
                      <div className="flex items-center gap-1 text-xs text-warning">
                        <TrendingDown className="size-3" />
                        {point.note}
                      </div>
                    )}
                    {point.distress_flag && (
                      <Badge variant="destructive" className="ml-auto text-xs">
                        Distress
                      </Badge>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-muted">
                  <Activity className="size-5 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-foreground">
                  No timeline data available
                </p>
                <p className="text-sm text-muted-foreground">
                  Financial health will appear here once it&apos;s generated.
                </p>
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
    <div className="rounded-lg bg-muted/60 p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={cn(
          "text-sm font-medium text-foreground",
          highlight && "text-destructive"
        )}
      >
        {value}
      </div>
    </div>
  );
}

function ProfileItem({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-medium text-foreground">{value}</div>
    </div>
  );
}

function RecommendationRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border py-2 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground tabular-nums">
        {value}
      </span>
    </div>
  );
}

function renderFactors(
  assessment: RiskAssessmentResponse,
  explanation: ExplanationResponse | null
) {
  const shapPositive = assessment.top_factors.filter(
    (f) => f.direction === "positive"
  );
  const shapNegative = assessment.top_factors.filter(
    (f) => f.direction === "negative"
  );

  if (shapPositive.length > 0 || shapNegative.length > 0) {
    return (
      <>
        <FactorGroup
          title="Positive Factors"
          factors={shapPositive.map((f) => f.factor)}
          tone="success"
        />
        <FactorGroup
          title="Negative Factors"
          factors={shapNegative.map((f) => f.factor)}
          tone="destructive"
        />
      </>
    );
  }

  if (
    explanation?.positive_factors?.length ||
    explanation?.negative_factors?.length
  ) {
    return (
      <>
        <FactorGroup
          title="Positive Factors"
          factors={explanation.positive_factors}
          tone="success"
        />
        <FactorGroup
          title="Negative Factors"
          factors={explanation.negative_factors}
          tone="destructive"
        />
      </>
    );
  }

  return (
    <p className="text-sm text-muted-foreground">
      No explanation data available.
    </p>
  );
}

function FactorGroup({
  title,
  factors,
  tone,
}: {
  title: string;
  factors: string[];
  tone: "success" | "destructive";
}) {
  if (factors.length === 0) return null;
  const chipClass =
    tone === "success"
      ? "border-success/30 bg-success/10 text-success"
      : "border-destructive/30 bg-destructive/10 text-destructive";
  const headingClass =
    tone === "success" ? "text-success" : "text-destructive";

  return (
    <div>
      <h3
        className={cn(
          "mb-2 text-xs uppercase tracking-wider",
          headingClass
        )}
      >
        {title}
      </h3>
      <div className="flex flex-wrap gap-2">
        {factors.map((factor, i) => (
          <span
            key={i}
            className={cn("rounded border px-2 py-1 text-xs", chipClass)}
          >
            {tone === "success" ? "+" : "−"} {factor}
          </span>
        ))}
      </div>
    </div>
  );
}
