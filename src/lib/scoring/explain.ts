import type { CustomerFeatures } from '@/lib/features/types'
import { formatPKR, formatPercent, pluralize } from '@/lib/utils/format'
import type { CreditScore, FeatureContribution } from './score'
import type { FeatureKey } from './model'

/**
 * The explainability layer.
 *
 * The README's example is the standard every sentence here has to meet:
 *
 *     "Pays utility bills on time 11 of the last 12 months (+)"
 *
 * Note what that does. It names the behaviour, quantifies it with the actual
 * numbers, and says which way it counts — without a single model term. A loan
 * officer can read it aloud to the applicant, and the applicant can argue with
 * it, which is the real test: an explanation you cannot dispute is not an
 * explanation, it is a decoration.
 *
 * These sentences are generated from the same contributions that produced the
 * score, so they cannot drift from it. Nothing here is an approximation of
 * what the model did — it is a restatement of it.
 */

export interface ScoreReason {
  key: FeatureKey
  /** The sentence itself. Complete, specific, jargon-free. */
  sentence: string
  /** A short headline for dense layouts. */
  headline: string
  points: number
  direction: 'positive' | 'negative' | 'neutral'
  /** What the metric means, for the tooltip. */
  detail: string
}

type Phraser = (features: CustomerFeatures, contribution: FeatureContribution) => {
  headline: string
  sentence: string
}

/**
 * One phraser per feature.
 *
 * Written out by hand rather than generated from a template because the
 * natural way to say each of these is genuinely different. "Paid 11 of 12
 * bills on time" and "income fell 38% over the last three months" do not come
 * from the same sentence shape, and forcing them to would make both worse.
 */
const PHRASERS: Record<FeatureKey, Phraser> = {
  bill_punctuality: (f) => {
    const total = f.billsTotal
    const onTime = f.billsPaidOnTime
    if (total === 0) {
      return {
        headline: 'No utility bills on record',
        sentence:
          'There are no utility bills on record, so we cannot see how reliably they meet a recurring obligation.',
      }
    }
    if (onTime === total) {
      return {
        headline: `Paid all ${total} bills on time`,
        sentence: `Paid every one of their last ${total} utility bills on or before the due date.`,
      }
    }
    const late = f.billsPaidLate
    const unpaid = f.billsUnpaid
    const tail =
      unpaid > 0
        ? ` ${late} arrived late and ${unpaid} ${unpaid === 1 ? 'was' : 'were'} never paid.`
        : ` The other ${late} arrived late, on average ${Math.round(f.avgDaysLate)} days after the due date.`
    return {
      headline: `Paid ${onTime} of ${total} bills on time`,
      sentence: `Paid ${onTime} of their last ${total} utility bills on time.${tail}`,
    }
  },

  income_regularity: (f) => {
    const months = f.monthsWithIncome
    const pct = f.incomeRegularity
    if (pct >= 0.95) {
      return {
        headline: `Earned in ${months} of the last ${months} months`,
        sentence: `Money came in during every one of the last ${months} months — the income arrives dependably even though the amount varies.`,
      }
    }
    const observed = Math.round(months / Math.max(pct, 0.01))
    return {
      headline: `Earned in ${months} of ${observed} months`,
      sentence: `Money came in during ${months} of the last ${observed} months, leaving ${observed - months} ${observed - months === 1 ? 'month' : 'months'} with no income at all.`,
    }
  },

  income_volatility: (f) => {
    const v = f.incomeVolatility
    if (v <= 0.3) {
      return {
        headline: 'Income is very steady month to month',
        sentence: `Monthly income barely moves — it averages ${formatPKR(f.avgMonthlyInflow)} and stays close to that, which is about as predictable as a salary.`,
      }
    }
    if (v <= 0.55) {
      return {
        headline: 'Income is fairly steady',
        sentence: `Monthly income averages ${formatPKR(f.avgMonthlyInflow)} and moves within a workable range.`,
      }
    }
    return {
      headline: 'Income swings sharply between months',
      sentence: `Monthly income swings a long way around its ${formatPKR(f.avgMonthlyInflow)} average, so a fixed instalment is harder to meet in a quiet month.`,
    }
  },

  income_trend_90d: (f) => {
    const change = (f.incomeTrend90d - 1) * 100
    if (change >= 10) {
      return {
        headline: `Income up ${Math.round(change)}% this quarter`,
        sentence: `Earnings over the last 90 days are ${Math.round(change)}% higher than the 90 days before.`,
      }
    }
    if (change >= -8) {
      return {
        headline: 'Income holding steady',
        sentence: 'Earnings over the last 90 days are broadly level with the previous quarter.',
      }
    }
    return {
      headline: `Income down ${Math.abs(Math.round(change))}% this quarter`,
      sentence: `Earnings over the last 90 days are ${Math.abs(Math.round(change))}% lower than the 90 days before — the sharpest warning sign in this profile.`,
    }
  },

  savings_rate: (f) => {
    const rate = f.savingsRate
    const monthly = f.avgMonthlyInflow - f.avgMonthlyOutflow
    if (rate >= 0.18) {
      return {
        headline: `Keeps ${formatPercent(rate, { decimals: 0 })} of what they earn`,
        sentence: `Around ${formatPKR(Math.max(0, monthly))} is left over each month after everything they spend — clear room for an instalment.`,
      }
    }
    if (rate > 0.03) {
      return {
        headline: `Keeps ${formatPercent(rate, { decimals: 0 })} of what they earn`,
        sentence: `Roughly ${formatPKR(Math.max(0, monthly))} is left each month, so any instalment would need to be modest.`,
      }
    }
    return {
      headline: 'Spends everything that comes in',
      sentence:
        'Outgoings match or exceed income most months, leaving no headroom for a loan repayment.',
    }
  },

  current_missed_streak: (f) => {
    const streak = f.currentMissedStreak
    if (streak === 0) {
      return {
        headline: 'No recent missed bills',
        sentence: 'The most recent months are clean — no bill has been missed or paid late.',
      }
    }
    return {
      headline: `${pluralize(streak, 'consecutive month')} with a missed bill`,
      sentence: `A bill has been missed or paid late in each of the last ${pluralize(streak, 'month')} — this is a live problem, not history.`,
    }
  },

  wallet_tenure_months: (f) => {
    const months = f.walletTenureMonths
    if (months >= 24) {
      const years = Math.floor(months / 12)
      return {
        headline: `${pluralize(years, 'year')} of wallet history`,
        sentence: `The wallet has been open ${months} months, giving a long track record that would be hard to fabricate.`,
      }
    }
    if (months >= 12) {
      return {
        headline: `${months} months of wallet history`,
        sentence: `Just over a year of history — enough to read a pattern from.`,
      }
    }
    return {
      headline: `Only ${months} months of history`,
      sentence: `The wallet is ${months} months old, so there is limited evidence behind any assessment.`,
    }
  },

  activity_density: (f) => {
    const density = f.activityDensity
    if (density >= 0.5) {
      return {
        headline: 'Uses the wallet most days',
        sentence: `Transacted on ${formatPercent(density, { decimals: 0 })} of days — this wallet is how they run their money, so we can see most of it.`,
      }
    }
    if (density >= 0.15) {
      return {
        headline: 'Uses the wallet regularly',
        sentence: `Transacted on ${formatPercent(density, { decimals: 0 })} of days, alongside cash we cannot see.`,
      }
    }
    return {
      headline: 'Uses the wallet rarely',
      sentence: `Transacted on only ${formatPercent(density, { decimals: 0 })} of days, so most of their financial life is invisible to us.`,
    }
  },

  distinct_income_sources: (f) => {
    const sources = f.distinctIncomeSources
    if (sources >= 4) {
      return {
        headline: `Paid by ${sources} different sources`,
        sentence: `Income arrives from ${sources} separate counterparties, so losing any one of them would not end their earnings.`,
      }
    }
    if (sources >= 2) {
      return {
        headline: `Paid by ${sources} sources`,
        sentence: `Income comes from ${sources} counterparties — losing one would hurt noticeably.`,
      }
    }
    return {
      headline: 'Depends on a single payer',
      sentence:
        'All identifiable income comes from one counterparty. If that relationship ends, so does their ability to repay.',
    }
  },

  days_since_last_transaction: (f) => {
    const days = f.daysSinceLastTransaction ?? 365
    if (days <= 7) {
      return {
        headline: 'Active this week',
        sentence: 'The wallet was used within the last week, so the account is live.',
      }
    }
    if (days <= 30) {
      return {
        headline: 'Active this month',
        sentence: `Last used ${days} days ago.`,
      }
    }
    return {
      headline: `Dormant for ${days} days`,
      sentence: `Nothing has moved through this wallet for ${days} days, which often precedes trouble.`,
    }
  },

  cash_out_ratio: (f) => {
    const ratio = f.cashOutRatio
    if (ratio <= 0.25) {
      return {
        headline: 'Spending stays mostly digital',
        sentence: `Only ${formatPercent(ratio, { decimals: 0 })} of income is withdrawn as cash, so we can see where most of the money goes.`,
      }
    }
    return {
      headline: `${formatPercent(ratio, { decimals: 0 })} taken out as cash`,
      sentence: `${formatPercent(ratio, { decimals: 0 })} of income is withdrawn as cash and becomes invisible to us. That is not a fault — it simply limits how much of their behaviour we can verify.`,
    }
  },

  avg_monthly_inflow: (f) => ({
    headline: `Earns ${formatPKR(f.avgMonthlyInflow)} a month`,
    sentence: `Average monthly earnings of ${formatPKR(f.avgMonthlyInflow)}, with the largest single payment at ${formatPKR(f.largestSingleInflow)}.`,
  }),
}

/** Every contribution, as a sentence, ranked by impact. */
export function explainScore(score: CreditScore, features: CustomerFeatures): ScoreReason[] {
  return score.contributions.map((contribution) => {
    const phrase = PHRASERS[contribution.key](features, contribution)
    return {
      key: contribution.key,
      headline: phrase.headline,
      sentence: phrase.sentence,
      points: contribution.points,
      direction: contribution.direction,
      detail: contribution.description,
    }
  })
}

/** Only the reasons that actually moved the score. */
export function significantReasons(score: CreditScore, features: CustomerFeatures): ScoreReason[] {
  return explainScore(score, features).filter((r) => r.direction !== 'neutral')
}

/**
 * The one-paragraph summary a loan officer reads first.
 *
 * Deliberately leads with the decision-relevant verdict, then the two things
 * driving it. Anyone reading only this sentence should still be able to act.
 */
export function summariseScore(
  score: CreditScore,
  features: CustomerFeatures,
  name: string,
): string {
  const reasons = explainScore(score, features)
  const top = reasons.filter((r) => r.direction === 'positive').slice(0, 2)
  const bottom = reasons.filter((r) => r.direction === 'negative').slice(0, 2)
  const firstName = name.split(' ')[0]

  const opening = `${firstName} scores ${score.score} out of 1000 — ${score.band.label.toLowerCase()}, meaning they are ${score.band.verdict.toLowerCase()}.`

  const strengths =
    top.length > 0
      ? ` The strongest points in their favour: ${top.map((r) => r.headline.toLowerCase()).join(', and ')}.`
      : ''

  const concerns =
    bottom.length > 0
      ? ` Working against them: ${bottom.map((r) => r.headline.toLowerCase()).join(', and ')}.`
      : ' Nothing in the record counts meaningfully against them.'

  return opening + strengths + concerns
}

/**
 * The sentence to put in front of the applicant when a decision goes against
 * them. Adverse-action reasoning: specific, factual, and actionable — never
 * "your score was too low", which tells someone nothing they can change.
 */
export function adverseActionReasons(
  score: CreditScore,
  features: CustomerFeatures,
  limit = 3,
): string[] {
  return explainScore(score, features)
    .filter((r) => r.direction === 'negative')
    .slice(0, limit)
    .map((r) => r.sentence)
}
