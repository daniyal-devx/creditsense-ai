import 'server-only'
import { query, queryOne } from './client'
import { getRiskBand, type RiskBand } from '@/lib/risk'
import type { CreditScore, FeatureContribution } from '@/lib/scoring/score'
import { scoreCustomer } from '@/lib/scoring/score'
import type { CustomerFeatures } from '@/lib/features/types'
import { getCustomerFeatures, type FullFeatures } from './customers'

/** Reads and writes for stored credit scores. */

export interface StoredScore {
  scoreId: string
  customerId: string
  score: number
  band: RiskBand
  probabilityOfDefault: number
  modelVersion: string
  contributions: FeatureContribution[]
  trigger: string
  scoredAt: Date
}

function mapScore(r: Record<string, unknown>): StoredScore {
  const score = Number(r.score)
  return {
    scoreId: (r.score_id ?? r.id) as string,
    customerId: r.customer_id as string,
    score,
    band: getRiskBand(score),
    probabilityOfDefault: Number(r.probability_of_default ?? 0),
    modelVersion: r.model_version as string,
    contributions: (r.contributions as FeatureContribution[]) ?? [],
    trigger: r.trigger as string,
    scoredAt: r.scored_at as Date,
  }
}

/** The customer's current score, or null if they have never been scored. */
export async function getCurrentScore(customerId: string): Promise<StoredScore | null> {
  const row = await queryOne<Record<string, unknown>>(
    'select * from current_credit_scores where customer_id = $1',
    [customerId],
  )
  return row ? mapScore(row) : null
}

/**
 * Score history, oldest first — the series the trend chart plots and the
 * evidence Phase 6 uses to detect deterioration.
 */
export async function getScoreHistory(customerId: string, limit = 24): Promise<StoredScore[]> {
  const rows = await query<Record<string, unknown>>(
    `select id as score_id, customer_id, score, risk_band, probability_of_default,
            model_version, contributions, trigger, scored_at
       from credit_scores
      where customer_id = $1
      order by scored_at desc
      limit $2`,
    [customerId, limit],
  )
  return rows.map(mapScore).reverse()
}

/**
 * Turn a stored feature row into the in-memory shape the scorecard expects.
 *
 * `numeric` arrives from pg as a string so no precision is lost in transit;
 * every one is converted here rather than letting `"0.84"` leak into the model
 * and be silently coerced.
 */
export function fullFeaturesToModelInput(f: FullFeatures): CustomerFeatures {
  return {
    computedAt: f.computedAt,
    windowStart: f.windowStart,
    windowEnd: f.windowEnd,
    observationDays: f.observationDays,
    totalInflow: f.totalInflow,
    totalOutflow: f.totalOutflow,
    netFlow: f.netFlow,
    avgMonthlyInflow: f.avgMonthlyInflow,
    medianMonthlyInflow: f.medianMonthlyInflow,
    incomeVolatility: f.incomeVolatility,
    incomeRegularity: f.incomeRegularity,
    monthsWithIncome: f.monthsWithIncome,
    incomeTrend90d: f.incomeTrend90d,
    largestSingleInflow: f.largestSingleInflow,
    distinctIncomeSources: f.distinctIncomeSources,
    cashOutRatio: f.cashOutRatio,
    avgMonthlyOutflow: f.avgMonthlyOutflow,
    savingsRate: f.savingsRate,
    avgEndOfMonthBalance: f.avgEndOfMonthBalance,
    daysWithZeroBalance: f.daysWithZeroBalance,
    billsTotal: f.billsTotal,
    billsPaidOnTime: f.billsPaidOnTime,
    billsPaidLate: f.billsPaidLate,
    billsUnpaid: f.billsUnpaid,
    billPunctuality: f.billPunctuality,
    avgDaysLate: f.avgDaysLate,
    worstDaysLate: f.worstDaysLate,
    currentMissedStreak: f.currentMissedStreak,
    longestMissedStreak: f.longestMissedStreak,
    distinctBillers: f.distinctBillers,
    topupCount: f.topupCount,
    avgMonthlyTopupAmount: f.avgMonthlyTopupAmount,
    topupRegularity: f.topupRegularity,
    daysSinceLastTopup: f.daysSinceLastTopup,
    walletTenureMonths: f.walletTenureMonths,
    transactionCount: f.transactionCount,
    activeDays: f.activeDays,
    activityDensity: f.activityDensity,
    daysSinceLastTransaction: f.daysSinceLastTransaction,
    longestDormancyDays: f.longestDormancyDays,
    activeLoanCount: f.activeLoanCount,
    totalOutstanding: f.totalOutstanding,
    historicalRepayments: f.historicalRepayments,
    historicalOnTimeRate: f.historicalOnTimeRate,
    raw: {},
  }
}

/**
 * Score a customer now and persist the result.
 *
 * Used when an application arrives, and by the Phase 6 monitoring loop. Always
 * appends — a score is a record of a judgement made at a moment in time, and
 * overwriting one would destroy the evidence behind a past decision.
 */
export async function scoreAndStore(
  customerId: string,
  options: {
    trigger?: 'application' | 'monitoring' | 'manual' | 'batch'
    applicationId?: string | null
  } = {},
): Promise<{ score: CreditScore; features: CustomerFeatures } | null> {
  const stored = await getCustomerFeatures(customerId)
  if (!stored) return null

  const features = fullFeaturesToModelInput(stored)
  const result = scoreCustomer(features)

  await query(
    `insert into credit_scores
       (customer_id, application_id, score, risk_band, probability_of_default,
        model_version, model_trained_at, contributions, feature_snapshot, trigger, scored_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11)`,
    [
      customerId,
      options.applicationId ?? null,
      result.score,
      result.band.id,
      result.probabilityOfDefault.toFixed(6),
      result.modelVersion,
      result.modelTrainedAt,
      JSON.stringify(result.contributions),
      JSON.stringify(features),
      options.trigger ?? 'manual',
      result.scoredAt,
    ],
  )

  return { score: result, features }
}

export interface ScoreDistributionRow {
  band: RiskBand
  customers: number
  avgScore: number
  minScore: number
  maxScore: number
  avgPd: number
}

/** Portfolio-level distribution, for the risk dashboard. */
export async function getScoreDistribution(): Promise<ScoreDistributionRow[]> {
  const rows = await query<{
    risk_band: string
    customers: string
    avg_score: string
    min_score: number
    max_score: number
    avg_pd: string
  }>('select * from score_distribution')

  const byBand = new Map(rows.map((r) => [r.risk_band, r]))

  // Every band is returned, including empty ones. A distribution chart that
  // silently omits a band makes the remaining ones look more balanced than
  // they are.
  return [...['very-low', 'low', 'moderate', 'high', 'very-high']].map((id) => {
    const row = byBand.get(id)
    const band = getRiskBand(
      id === 'very-low' ? 900 : id === 'low' ? 780 : id === 'moderate' ? 620 : id === 'high' ? 470 : 200,
    )
    return {
      band,
      customers: Number(row?.customers ?? 0),
      avgScore: Number(row?.avg_score ?? 0),
      minScore: Number(row?.min_score ?? 0),
      maxScore: Number(row?.max_score ?? 0),
      avgPd: Number(row?.avg_pd ?? 0),
    }
  })
}

export interface PortfolioScoreStats {
  scoredCustomers: number
  averageScore: number
  medianScore: number
  lastScoredAt: Date | null
  modelVersion: string | null
}

export async function getPortfolioScoreStats(): Promise<PortfolioScoreStats> {
  const row = await queryOne<{
    n: string
    avg_score: string | null
    median_score: string | null
    last_scored: Date | null
    model_version: string | null
  }>(`
    select
      count(*)::text                                                        as n,
      round(avg(score))::text                                               as avg_score,
      percentile_cont(0.5) within group (order by score)::int::text         as median_score,
      max(scored_at)                                                        as last_scored,
      (select model_version from credit_scores order by scored_at desc limit 1) as model_version
    from current_credit_scores
  `)

  return {
    scoredCustomers: Number(row?.n ?? 0),
    averageScore: Number(row?.avg_score ?? 0),
    medianScore: Number(row?.median_score ?? 0),
    lastScoredAt: row?.last_scored ?? null,
    modelVersion: row?.model_version ?? null,
  }
}

/** Scores for many customers at once — used by the queue and the customer list. */
export async function getScoresForCustomers(
  customerIds: string[],
): Promise<Map<string, StoredScore>> {
  if (customerIds.length === 0) return new Map()

  const rows = await query<Record<string, unknown>>(
    'select * from current_credit_scores where customer_id = any($1::uuid[])',
    [customerIds],
  )

  return new Map(rows.map((r) => [r.customer_id as string, mapScore(r)]))
}
