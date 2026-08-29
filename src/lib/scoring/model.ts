/**
 * The CreditSense scorecard.
 *
 * A logistic-regression scorecard over binned features, not a black box. That
 * choice is the whole point of this module, so it is worth stating plainly:
 *
 *   A lender has to be able to defend a rejection — to the applicant, to their
 *   own risk committee, and to a regulator. "The gradient-boosted ensemble
 *   said no" is not a defence. A scorecard gives every feature an explicit,
 *   inspectable points contribution, so the explanation *is* the model rather
 *   than a post-hoc approximation of it (which is what SHAP on a tree ensemble
 *   gives you, and it can disagree with the model that actually decided).
 *
 *   It also runs in microseconds with no runtime, which matters when the whole
 *   product deploys as one serverless bundle.
 *
 * Binning each feature before weighting it buys two things: the model captures
 * non-linear effects (income volatility hurts a lot past a threshold and
 * barely at all below it), and a wild outlier lands in the end bin instead of
 * dragging the score off the scale.
 *
 * Coefficients are fitted by `npm run model:train` against the labelled
 * synthetic population and written to `coefficients.ts`. This file holds the
 * structure; that one holds the numbers.
 */

import type { CustomerFeatures } from '@/lib/features/types'

export type FeatureKey =
  | 'bill_punctuality'
  | 'income_regularity'
  | 'income_volatility'
  | 'income_trend_90d'
  | 'savings_rate'
  | 'wallet_tenure_months'
  | 'activity_density'
  | 'distinct_income_sources'
  | 'current_missed_streak'
  | 'cash_out_ratio'
  | 'days_since_last_transaction'
  | 'avg_monthly_inflow'

export interface Bin {
  /** Inclusive lower bound. `-Infinity` for the first bin. */
  min: number
  /** Exclusive upper bound. `Infinity` for the last bin. */
  max: number
  /** Short label for the explanation, e.g. "90–100%". */
  label: string
}

export interface FeatureSpec {
  key: FeatureKey
  /** How the feature is named to a human. No underscores, no jargon. */
  label: string
  /** Where the value comes from. */
  extract: (features: CustomerFeatures) => number
  bins: Bin[]
  /**
   * Whether a higher raw value is better. Used to sanity-check the fitted
   * weights: if a feature we believe is protective comes out with the opposite
   * sign, that is a bug in the data or the fit, not a discovery.
   */
  higherIsBetter: boolean
  /**
   * Relative importance cap, 0–1. Stops any single feature dominating the
   * score. Bill punctuality is the strongest signal we have, but a model that
   * is 80% one feature is fragile and unfair to anyone whose landlord pays
   * the utilities.
   */
  maxWeight: number
  /** One sentence on what this measures, for the tooltip and the audit trail. */
  description: string
}

/**
 * The feature set.
 *
 * Deliberately excluded: age, gender, city, persona, education, household
 * size. Some are legally protected characteristics; the rest are proxies for
 * them. A model that scores a Quetta driver lower than a Lahore driver on
 * identical behaviour has learned geography, not credit risk — and this
 * product exists to remove exactly that kind of exclusion, not to automate it.
 *
 * Every feature here is something the applicant *did*.
 */
export const FEATURE_SPECS: readonly FeatureSpec[] = [
  {
    key: 'bill_punctuality',
    label: 'Bills paid on time',
    extract: (f) => f.billPunctuality,
    higherIsBetter: true,
    maxWeight: 0.24,
    description:
      'The share of utility bills paid on or before the due date — the closest thing to a repayment record a thin-file applicant has.',
    bins: [
      { min: -Infinity, max: 0.5, label: 'under 50%' },
      { min: 0.5, max: 0.7, label: '50–70%' },
      { min: 0.7, max: 0.85, label: '70–85%' },
      { min: 0.85, max: 0.95, label: '85–95%' },
      { min: 0.95, max: Infinity, label: '95% or better' },
    ],
  },
  {
    key: 'income_regularity',
    label: 'Income regularity',
    extract: (f) => f.incomeRegularity,
    higherIsBetter: true,
    maxWeight: 0.18,
    description: 'The share of months in which any money was earned at all.',
    bins: [
      { min: -Infinity, max: 0.5, label: 'under half the months' },
      { min: 0.5, max: 0.75, label: '50–75% of months' },
      { min: 0.75, max: 0.92, label: '75–92% of months' },
      { min: 0.92, max: Infinity, label: 'almost every month' },
    ],
  },
  {
    key: 'income_volatility',
    label: 'Income stability',
    extract: (f) => f.incomeVolatility,
    higherIsBetter: false,
    maxWeight: 0.16,
    description:
      'How much monthly income swings relative to its own average. A fixed instalment is harder to meet on a swinging income.',
    bins: [
      { min: -Infinity, max: 0.3, label: 'very steady' },
      { min: 0.3, max: 0.55, label: 'steady' },
      { min: 0.55, max: 0.85, label: 'variable' },
      { min: 0.85, max: Infinity, label: 'highly variable' },
    ],
  },
  {
    key: 'savings_rate',
    label: 'Money kept each month',
    extract: (f) => f.savingsRate,
    higherIsBetter: true,
    maxWeight: 0.16,
    description:
      'What is left after everything they spend — the headroom a monthly instalment has to fit into.',
    bins: [
      { min: -Infinity, max: 0, label: 'spends more than they earn' },
      { min: 0, max: 0.08, label: 'almost nothing left' },
      { min: 0.08, max: 0.18, label: 'a small margin' },
      { min: 0.18, max: 0.3, label: 'a comfortable margin' },
      { min: 0.3, max: Infinity, label: 'a large margin' },
    ],
  },
  {
    key: 'income_trend_90d',
    label: 'Recent income trend',
    extract: (f) => f.incomeTrend90d,
    higherIsBetter: true,
    maxWeight: 0.14,
    description:
      'Income over the last 90 days against the 90 before it. A sharp fall is the earliest warning we get.',
    bins: [
      { min: -Infinity, max: 0.7, label: 'fallen sharply' },
      { min: 0.7, max: 0.92, label: 'softened' },
      { min: 0.92, max: 1.1, label: 'holding steady' },
      { min: 1.1, max: Infinity, label: 'growing' },
    ],
  },
  {
    key: 'current_missed_streak',
    label: 'Recent missed bills',
    extract: (f) => f.currentMissedStreak,
    higherIsBetter: false,
    maxWeight: 0.14,
    description:
      'Consecutive recent months with a missed or late bill. Unlike the overall rate, this says whether there is a problem right now.',
    bins: [
      { min: -Infinity, max: 1, label: 'none' },
      { min: 1, max: 2, label: 'one month' },
      { min: 2, max: 4, label: 'two to three months' },
      { min: 4, max: Infinity, label: 'four months or more' },
    ],
  },
  {
    key: 'wallet_tenure_months',
    label: 'Wallet history',
    extract: (f) => f.walletTenureMonths,
    higherIsBetter: true,
    maxWeight: 0.1,
    description:
      'How long the wallet has been open. A longer record is harder to fabricate and gives more behaviour to read.',
    bins: [
      { min: -Infinity, max: 6, label: 'under 6 months' },
      { min: 6, max: 12, label: '6–12 months' },
      { min: 12, max: 24, label: '1–2 years' },
      { min: 24, max: Infinity, label: 'over 2 years' },
    ],
  },
  {
    key: 'activity_density',
    label: 'Wallet activity',
    extract: (f) => f.activityDensity,
    higherIsBetter: true,
    maxWeight: 0.09,
    description:
      'The share of days with a transaction. Heavy use means more of their financial life is visible to us.',
    bins: [
      { min: -Infinity, max: 0.1, label: 'rarely used' },
      { min: 0.1, max: 0.3, label: 'used occasionally' },
      { min: 0.3, max: 0.6, label: 'used regularly' },
      { min: 0.6, max: Infinity, label: 'used most days' },
    ],
  },
  {
    key: 'distinct_income_sources',
    label: 'Income sources',
    extract: (f) => f.distinctIncomeSources,
    higherIsBetter: true,
    maxWeight: 0.08,
    description:
      'How many separate counterparties pay them. One source means their whole income ends if that relationship does.',
    bins: [
      { min: -Infinity, max: 2, label: 'one or none' },
      { min: 2, max: 4, label: 'two or three' },
      { min: 4, max: 8, label: 'four to seven' },
      { min: 8, max: Infinity, label: 'eight or more' },
    ],
  },
  {
    key: 'days_since_last_transaction',
    label: 'Account dormancy',
    extract: (f) => f.daysSinceLastTransaction ?? 365,
    higherIsBetter: false,
    maxWeight: 0.08,
    description: 'Days since the last transaction. A wallet going quiet often precedes trouble.',
    bins: [
      { min: -Infinity, max: 7, label: 'active this week' },
      { min: 7, max: 30, label: 'active this month' },
      { min: 30, max: 90, label: 'quiet for over a month' },
      { min: 90, max: Infinity, label: 'dormant' },
    ],
  },
  {
    key: 'cash_out_ratio',
    label: 'Taken as cash',
    extract: (f) => f.cashOutRatio,
    higherIsBetter: false,
    maxWeight: 0.06,
    description:
      'The share of income withdrawn as cash. Not bad behaviour — it simply means less of their spending is observable.',
    bins: [
      { min: -Infinity, max: 0.25, label: 'mostly digital' },
      { min: 0.25, max: 0.5, label: 'a mix' },
      { min: 0.5, max: Infinity, label: 'mostly cash' },
    ],
  },
  {
    key: 'avg_monthly_inflow',
    label: 'Monthly income',
    extract: (f) => f.avgMonthlyInflow,
    higherIsBetter: true,
    maxWeight: 0.07,
    description:
      'Average money earned per month. Weighted lightly on purpose: this product exists to lend to lower earners who behave well, not to rank people by income.',
    bins: [
      { min: -Infinity, max: 25_000, label: 'under Rs 25,000' },
      { min: 25_000, max: 50_000, label: 'Rs 25,000–50,000' },
      { min: 50_000, max: 100_000, label: 'Rs 50,000–100,000' },
      { min: 100_000, max: Infinity, label: 'over Rs 100,000' },
    ],
  },
]

export const FEATURE_SPEC_BY_KEY = new Map<FeatureKey, FeatureSpec>(
  FEATURE_SPECS.map((spec) => [spec.key, spec]),
)

/** Which bin a raw value falls into. */
export function binIndexFor(spec: FeatureSpec, value: number): number {
  const v = Number.isFinite(value) ? value : 0
  for (let i = 0; i < spec.bins.length; i++) {
    const bin = spec.bins[i]
    if (v >= bin.min && v < bin.max) return i
  }
  // Only reachable if the bins are misconfigured; the last bin is the safest
  // fallback because it is the one with an open upper bound.
  return spec.bins.length - 1
}

/** The one-hot encoding of a feature vector, in a stable column order. */
export function encodeFeatures(features: CustomerFeatures): number[] {
  const encoded: number[] = []
  for (const spec of FEATURE_SPECS) {
    const index = binIndexFor(spec, spec.extract(features))
    for (let i = 0; i < spec.bins.length; i++) {
      encoded.push(i === index ? 1 : 0)
    }
  }
  return encoded
}

/** Column labels matching `encodeFeatures`, for training diagnostics. */
export function encodedColumnNames(): string[] {
  const names: string[] = []
  for (const spec of FEATURE_SPECS) {
    for (const bin of spec.bins) {
      names.push(`${spec.key}:${bin.label}`)
    }
  }
  return names
}

export const TOTAL_ENCODED_COLUMNS = FEATURE_SPECS.reduce((sum, s) => sum + s.bins.length, 0)
