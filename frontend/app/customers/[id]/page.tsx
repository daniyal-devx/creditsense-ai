"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getCustomer, getExplanation, getFinancialHealth, createApplication, runRiskAssessment } from "@/lib/api";
import { cn, riskColor, riskBg, decisionColor, formatPKR } from "@/lib/utils";

export default function CustomerPage() {
  const params = useParams();
  const id = Number(params.id);

  const [customer, setCustomer] = useState<any>(null);
  const [explanation, setExplanation] = useState<any>(null);
  const [timeline, setTimeline] = useState<any>(null);
  const [assessment, setAssessment] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [assessing, setAssessing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    loadData();
  }, [id]);

  async function loadData() {
    try {
      const c = await getCustomer(id);
      setCustomer(c);

      try {
        const [exp, health] = await Promise.all([getExplanation(id), getFinancialHealth(id)]);
        setExplanation(exp);
        setTimeline(health);
      } catch {}
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleAssess() {
    if (!customer) return;
    setAssessing(true);
    try {
      const profile = customer.financial_profile;
      const app = await createApplication(
        id,
        profile?.loan_amount || 150000,
        profile?.loan_term || 6
      );
      const result = await runRiskAssessment(app.id);
      setAssessment(result);

      const [exp, health] = await Promise.all([getExplanation(id), getFinancialHealth(id)]);
      setExplanation(exp);
      setTimeline(health);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setAssessing(false);
    }
  }

  if (loading) return <div className="flex items-center justify-center h-96 text-slate-400">Loading...</div>;
  if (error) return <div className="text-red-400 p-8">Error: {error}</div>;
  if (!customer) return <div className="text-slate-400 p-8">Customer not found</div>;

  const profile = customer.financial_profile;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">{customer.name}</h1>
          <p className="text-slate-400 text-sm mt-1">
            {customer.employment_type?.replace(/_/g, " ")} — {formatPKR(customer.monthly_income)}/mo
          </p>
        </div>
        <button
          onClick={handleAssess}
          disabled={assessing}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
        >
          {assessing ? "Running Assessment..." : "Run Risk Assessment"}
        </button>
      </div>

      {assessment && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-navy-900 rounded-xl border border-navy-700 p-6">
            <h2 className="text-lg font-semibold text-white mb-4">CreditSense Score</h2>
            <div className="space-y-4">
              <div className="flex items-baseline gap-2">
                <span className="text-5xl font-bold text-white">{assessment.credit_score}</span>
                <span className="text-slate-400">/1000</span>
              </div>
              <div className="flex gap-4">
                <span className={cn("px-3 py-1 rounded-full text-sm font-medium border", riskBg(assessment.risk_level), riskColor(assessment.risk_level))}>
                  {assessment.risk_level}
                </span>
                <span className={cn("px-3 py-1 rounded-full text-sm font-medium", decisionColor(assessment.decision))}>
                  {assessment.decision}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-4">
                <InfoItem label="Repayment Probability" value={`${(assessment.repayment_probability * 100).toFixed(1)}%`} />
                <InfoItem label="Fraud Flag" value={assessment.fraud_flag ? "YES" : "No"} highlight={assessment.fraud_flag} />
                <InfoItem label="Recommended Amount" value={formatPKR(assessment.recommended_amount || 0)} />
                <InfoItem label="Recommended Tenure" value={`${assessment.recommended_tenure_months} months`} />
              </div>
            </div>
          </div>

          <div className="bg-navy-900 rounded-xl border border-navy-700 p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Explainability</h2>
            {assessment.top_factors?.length > 0 ? (
              <div className="space-y-3">
                <div>
                  <h3 className="text-xs uppercase tracking-wider text-green-400 mb-2">Positive Factors</h3>
                  <div className="flex flex-wrap gap-2">
                    {assessment.top_factors.filter((f: any) => f.direction === "positive").map((f: any, i: number) => (
                      <span key={i} className="px-2 py-1 bg-green-500/10 border border-green-500/30 text-green-300 rounded text-xs">
                        + {f.factor}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="text-xs uppercase tracking-wider text-red-400 mb-2">Negative Factors</h3>
                  <div className="flex flex-wrap gap-2">
                    {assessment.top_factors.filter((f: any) => f.direction === "negative").map((f: any, i: number) => (
                      <span key={i} className="px-2 py-1 bg-red-500/10 border border-red-500/30 text-red-300 rounded text-xs">
                        - {f.factor}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ) : explanation?.positive_factors || explanation?.negative_factors ? (
              <div className="space-y-3">
                <div>
                  <h3 className="text-xs uppercase tracking-wider text-green-400 mb-2">Positive Factors</h3>
                  <div className="flex flex-wrap gap-2">
                    {explanation.positive_factors?.map((f: string, i: number) => (
                      <span key={i} className="px-2 py-1 bg-green-500/10 border border-green-500/30 text-green-300 rounded text-xs">
                        + {f}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="text-xs uppercase tracking-wider text-red-400 mb-2">Negative Factors</h3>
                  <div className="flex flex-wrap gap-2">
                    {explanation.negative_factors?.map((f: string, i: number) => (
                      <span key={i} className="px-2 py-1 bg-red-500/10 border border-red-500/30 text-red-300 rounded text-xs">
                        - {f}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-slate-400 text-sm">No explanation data available yet.</p>
            )}
          </div>
        </div>
      )}

      {assessment?.fraud_flag && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
          <div className="flex items-center gap-2 text-red-400 font-semibold">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            Fraud Risk Detected
          </div>
          <p className="text-sm text-red-300 mt-1">
            Credit risk is {assessment.risk_level}, but fraud indicators are elevated. Decision: {assessment.decision}.
          </p>
          <a href={`/customers/${id}/fraud-network`} className="text-sm text-blue-400 hover:underline mt-2 inline-block">
            View Fraud Network Graph →
          </a>
        </div>
      )}

      {profile && (
        <div className="bg-navy-900 rounded-xl border border-navy-700 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Financial Profile</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <InfoItem label="Monthly Income" value={formatPKR(customer.monthly_income)} />
            <InfoItem label="Monthly Expenses" value={formatPKR(customer.monthly_expenses)} />
            <InfoItem label="Account Age" value={`${profile.account_age_months} months`} />
            <InfoItem label="Transaction Count" value={profile.transaction_count} />
            <InfoItem label="Avg Transaction" value={formatPKR(profile.avg_transaction)} />
            <InfoItem label="Digital Payment Ratio" value={`${(profile.digital_payment_ratio * 100).toFixed(0)}%`} />
            <InfoItem label="Income Stability" value={`${(profile.income_stability * 100).toFixed(0)}%`} />
            <InfoItem label="Existing Debt" value={formatPKR(profile.existing_debt)} />
          </div>
        </div>
      )}

      {timeline?.timeline?.length > 0 && (
        <div className="bg-navy-900 rounded-xl border border-navy-700 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Financial Health Timeline</h2>
          <div className="space-y-3">
            {timeline.timeline.map((point: any) => (
              <div key={point.month} className={cn(
                "flex items-center gap-4 p-3 rounded-lg",
                point.distress_flag ? "bg-red-500/10 border border-red-500/20" : "bg-navy-800/50"
              )}>
                <div className="text-sm font-medium text-slate-300 w-16">Month {point.month}</div>
                <div className={cn("text-sm font-bold w-12", riskColor(point.risk_level))}>
                  {point.credit_score}
                </div>
                <div className={cn("text-xs px-2 py-0.5 rounded", riskBg(point.risk_level), riskColor(point.risk_level))}>
                  {point.risk_level}
                </div>
                {point.note && <div className="text-xs text-amber-300">{point.note}</div>}
                {point.distress_flag && (
                  <span className="text-xs text-red-400 font-medium">⚠ Distress</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function InfoItem({ label, value, highlight }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div>
      <div className="text-xs text-slate-400">{label}</div>
      <div className={cn("text-sm font-medium", highlight ? "text-red-400" : "text-white")}>{value}</div>
    </div>
  );
}
