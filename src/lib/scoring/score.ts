import type { CustomerFeatures } from '@/lib/features/types'
import { clampScore, getRiskBand, type RiskBand } from '@/lib/risk'
import { BIAS, MODEL_METRICS, MODEL_TRAINED_AT, MODEL_VERSION, WEIGHTS } from './coefficients'
import { FEATURE_SPECS, binIndexFor, type FeatureKey, type FeatureSpec } from './model'

/**
 * Turning the model into a score.
 *
 * The model outputs a probability of default. A probability is the right thing
 * to reason with and the wrong thing to show a loan officer — "PD = 0.084"
 * means nothing at a glance, and worse, it invites treating 0.08 and 0.09 as
 * meaningfully different when they are not.
 *
 * So the probability is mapped onto a 0–1000 scale the standard scorecard way:
 * linear in log-odds, with a fixed number of points to double the odds. That
 * mapping has two properties that matter:
 *
 *   Equal score differences mean equal odds ratios anywhere on the scale, so
 *   "40 points better" means the same thing at 400 as at 800.
 *
 *   Every feature's contribution is a whole number of points that adds up
 *   exactly to the final score. The explanation is not an approximation of the
 *   model — it *is* the model, rearranged.
 */

/**
 * The scale, anchored so that both numbers mean something a person can hold
 * on to:
 *
 *   500 points is even odds — a coin flip on whether they repay.
 *   Every 90 points halves the odds of default.
 *
 * So 590 is half as likely to default as 500, and 680 is a quarter as likely.
 * That relationship holds anywhere on the scale, which is what makes "they
 * improved by 90 points" a meaningful statement rather than a vague one.
 *
 * The spread was chosen against the real distribution: a narrower scale
 * squeezed the whole portfolio into the middle two bands, leaving "Very Low"
 * and "Very High" permanently empty — bands that never occur are worse than
 * useless, because they make the ones that do occur look milder than they are.
 */
const POINTS_TO_DOUBLE_ODDS = 90
const FACTOR = POINTS_TO_DOUBLE_ODDS / Math.LN2
const OFFSET = 500

export interface FeatureContribution {
  key: FeatureKey
  label: string
  /** The raw feature value. */
  value: number
  /** Which bin it fell into. */
  binLabel: string
  binIndex: number
  /** Points added or removed, relative to a neutral applicant. */
  points: number
  /** `positive` helps the applicant, `negative` hurts them. */
  direction: 'positive' | 'negative' | 'neutral'
  /** Absolute points, for ranking by impact. */
  impact: number
  description: string
}

export interface CreditScore {
  /** 0–1000. The headline number. */
  score: number
  band: RiskBand
  /** Modelled probability of default over the next 12 months, 0–1. */
  probabilityOfDefault: number
  /** Points every applicant starts from, before their own behaviour. */
  basePoints: number
  /** Every feature's contribution, ranked by absolute impact. */
  contributions: FeatureContribution[]
  modelVersion: string
  modelTrainedAt: string
  scoredAt: Date
}

function sigmoid(z: number): number {
  if (z >= 0) {
    const e = Math.exp(-Math.min(z, 40))
    return 1 / (1 + e)
  }
  const e = Math.exp(Math.max(z, -40))
  return e / (1 + e)
}

/**
 * The column offset where each feature's bins start, and the mean weight
 * across those bins.
 *
 * The mean is the "neutral applicant" reference. Contributions are expressed
 * relative to it, which is what makes them read as "+38 because they pay their
 * bills" rather than as an arbitrary absolute number. Computed once at module
 * load — it depends only on the committed coefficients.
 */
const FEATURE_LAYOUT: { spec: FeatureSpec; offset: number; referenceWeight: number }[] = (() => {
  const layout: { spec: FeatureSpec; offset: number; referenceWeight: number }[] = []
  let offset = 0
  for (const spec of FEATURE_SPECS) {
    const slice = WEIGHTS.slice(offset, offset + spec.bins.length)
    const referenceWeight = slice.reduce((a, b) => a + b, 0) / Math.max(1, slice.length)
    layout.push({ spec, offset, referenceWeight })
    offset += spec.bins.length
  }
  return layout
})()

/** Points shared by every applicant: the model's base rate, in points. */
const BASE_POINTS = Math.round(
  OFFSET - FACTOR * (BIAS + FEATURE_LAYOUT.reduce((sum, f) => sum + f.referenceWeight, 0)),
)

/**
 * Score an applicant.
 *
 * Pure and synchronous: no database, no network, no randomness. The same
 * features always produce the same score, which is what makes a decision
 * defensible when it is audited a year later.
 */
export function scoreCustomer(features: CustomerFeatures, asOf: Date = new Date()): CreditScore {
  let logOdds = BIAS
  const contributions: FeatureContribution[] = []

  for (const { spec, offset, referenceWeight } of FEATURE_LAYOUT) {
    const value = spec.extract(features)
    const binIndex = binIndexFor(spec, value)
    const weight = WEIGHTS[offset + binIndex] ?? 0

    logOdds += weight

    // Points relative to the neutral reference. Negative weight (less likely
    // to default) becomes positive points, hence the sign flip.
    const points = Math.round(-FACTOR * (weight - referenceWeight))

    contributions.push({
      key: spec.key,
      label: spec.label,
      value,
      binLabel: spec.bins[binIndex].label,
      binIndex,
      points,
      // A tiny contribution is noise, not a reason. Anything under 3 points
      // would clutter the explanation without changing the decision.
      direction: points > 2 ? 'positive' : points < -2 ? 'negative' : 'neutral',
      impact: Math.abs(points),
      description: spec.description,
    })
  }

  const probabilityOfDefault = sigmoid(logOdds)

  // Algebraically identical to OFFSET - FACTOR * logOdds, but computed from
  // the parts so the displayed contributions provably add up to the score.
  const rawScore = BASE_POINTS + contributions.reduce((sum, c) => sum + c.points, 0)
  const score = clampScore(rawScore)

  contributions.sort((a, b) => b.impact - a.impact)

  return {
    score,
    band: getRiskBand(score),
    probabilityOfDefault,
    basePoints: BASE_POINTS,
    contributions,
    modelVersion: MODEL_VERSION,
    modelTrainedAt: MODEL_TRAINED_AT,
    scoredAt: asOf,
  }
}

/** The top reasons in the applicant's favour, strongest first. */
export function positiveFactors(score: CreditScore, limit = 4): FeatureContribution[] {
  return score.contributions.filter((c) => c.direction === 'positive').slice(0, limit)
}

/** The top reasons against, strongest first. */
export function negativeFactors(score: CreditScore, limit = 4): FeatureContribution[] {
  return score.contributions.filter((c) => c.direction === 'negative').slice(0, limit)
}

/**
 * How many points the applicant could gain by improving one thing.
 *
 * This is what turns a rejection into advice: "pay the next three bills on
 * time and this becomes an approval" is something a loan officer can actually
 * say to someone.
 */
export function improvementOpportunities(
  features: CustomerFeatures,
  limit = 3,
): { key: FeatureKey; label: string; currentBin: string; bestBin: string; pointsAvailable: number }[] {
  const opportunities = FEATURE_LAYOUT.map(({ spec, offset, referenceWeight }) => {
    const value = spec.extract(features)
    const binIndex = binIndexFor(spec, value)
    const currentWeight = WEIGHTS[offset + binIndex] ?? 0

    const slice = WEIGHTS.slice(offset, offset + spec.bins.length)
    // Lowest weight = lowest default log-odds = the best bin to be in.
    const bestWeight = Math.min(...slice)
    const bestIndex = slice.indexOf(bestWeight)

    return {
      key: spec.key,
      label: spec.label,
      currentBin: spec.bins[binIndex].label,
      bestBin: spec.bins[bestIndex].label,
      pointsAvailable: Math.round(-FACTOR * (bestWeight - currentWeight)),
      referenceWeight,
    }
  })

  return opportunities
    .filter((o) => o.pointsAvailable >= 5)
    .sort((a, b) => b.pointsAvailable - a.pointsAvailable)
    .slice(0, limit)
    .map(({ referenceWeight: _ref, ...rest }) => rest)
}

/** Model provenance, for the audit trail and the "about this score" panel. */
export const MODEL_INFO = {
  version: MODEL_VERSION,
  trainedAt: MODEL_TRAINED_AT,
  metrics: MODEL_METRICS,
  pointsToDoubleOdds: POINTS_TO_DOUBLE_ODDS,
  basePoints: BASE_POINTS,
  featureCount: FEATURE_SPECS.length,
} as const
