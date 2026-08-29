import type { SignalQuality } from '@/components/signals/signal-stat'
import type { FullFeatures } from '@/lib/db/customers'
import { formatPKR, formatPercent, pluralize } from '@/lib/utils/format'

/**
 * Turn engineered features into sentences.
 *
 * "Plain language over jargon" is a product rule, not a nicety. A loan officer
 * has to be able to read a decision out loud to the applicant and have it make
 * sense — "your income moved around a lot over the last year" is a thing a
 * person can respond to; "income_volatility = 0.62" is not.
 *
 * Phase 3's explainability layer builds on exactly these readings, so the
 * wording a customer hears at the decision matches what the officer saw on
 * screen. The thresholds live here, in one place, rather than being re-guessed
 * at every call site.
 */

export interface SignalReading {
  key: string
  label: string
  value: string
  interpretation: string
  quality: SignalQuality
  /** What the metric is, for the tooltip. */
  explain: string
}

/** Pick a band by descending threshold. */
function band<T>(value: number, bands: [threshold: number, result: T][], fallback: T): T {
  for (const [threshold, result] of bands) {
    if (value >= threshold) return result
  }
  return fallback
}

export function readIncomeRegularity(f: FullFeatures): SignalReading {
  const pct = f.incomeRegularity
  const quality: SignalQuality = band(
    pct,
    [
      [0.9, 'good' as const],
      [0.7, 'fair' as const],
    ],
    'poor',
  )
  return {
    key: 'income_regularity',
    label: 'Income regularity',
    value: formatPercent(pct),
    interpretation:
      pct >= 0.9
        ? `Earned money in ${f.monthsWithIncome} of the last ${Math.round(f.monthsWithIncome / Math.max(pct, 0.01))} months — income arrives dependably.`
        : pct >= 0.7
          ? `Earned in ${f.monthsWithIncome} months, with some gaps.`
          : `Earned in only ${f.monthsWithIncome} months — long stretches with no income at all.`,
    quality,
    explain:
      'The share of observed months in which any money was earned. High means income keeps arriving, even if the amount changes.',
  }
}

export function readIncomeVolatility(f: FullFeatures): SignalReading {
  const v = f.incomeVolatility
  // Lower is better here, so the bands run the other way.
  const quality: SignalQuality = v <= 0.35 ? 'good' : v <= 0.7 ? 'fair' : 'poor'
  return {
    key: 'income_volatility',
    label: 'Income stability',
    value: v.toFixed(2),
    interpretation:
      v <= 0.35
        ? 'Earnings are steady month to month — close to a salary in predictability.'
        : v <= 0.7
          ? 'Earnings move around, but within a workable range.'
          : 'Earnings swing sharply between months, so a fixed instalment carries more risk.',
    quality,
    explain:
      'How much monthly income varies, relative to its own average. 0 is a perfectly steady wage; above 0.7 the income is genuinely lumpy.',
  }
}

export function readIncomeTrend(f: FullFeatures): SignalReading {
  const t = f.incomeTrend90d
  const changePct = (t - 1) * 100
  const quality: SignalQuality = t >= 1.05 ? 'good' : t >= 0.85 ? 'fair' : 'poor'
  return {
    key: 'income_trend',
    label: 'Recent income trend',
    value: formatPercent(changePct, { alreadyPercent: true, sign: true, decimals: 0 }),
    interpretation:
      t >= 1.05
        ? `Income over the last 90 days is up ${Math.round(changePct)}% on the previous 90.`
        : t >= 0.95
          ? 'Income is holding steady against the previous quarter.'
          : t >= 0.85
            ? `Income has softened ${Math.abs(Math.round(changePct))}% against the previous quarter.`
            : `Income has dropped ${Math.abs(Math.round(changePct))}% in the last 90 days — a significant deterioration.`,
    quality,
    explain:
      'Money earned in the last 90 days compared with the 90 days before that. A sharp fall is the earliest warning sign we have.',
  }
}

export function readBillPunctuality(f: FullFeatures): SignalReading {
  const pct = f.billPunctuality
  const quality: SignalQuality = band(
    pct,
    [
      [0.9, 'good' as const],
      [0.7, 'fair' as const],
    ],
    'poor',
  )
  return {
    key: 'bill_punctuality',
    label: 'Bills paid on time',
    value: formatPercent(pct),
    interpretation:
      f.billsTotal === 0
        ? 'No utility bills on record for this applicant.'
        : pct >= 0.9
          ? `Paid ${f.billsPaidOnTime} of ${f.billsTotal} bills on or before the due date.`
          : pct >= 0.7
            ? `Paid ${f.billsPaidOnTime} of ${f.billsTotal} on time; ${f.billsPaidLate} arrived late.`
            : `Only ${f.billsPaidOnTime} of ${f.billsTotal} bills were paid on time, and ${f.billsUnpaid} were never paid.`,
    quality,
    explain:
      'The share of utility bills paid on or before the due date. For someone with no loan history, this is the closest thing to a repayment record.',
  }
}

export function readTenure(f: FullFeatures): SignalReading {
  const months = f.walletTenureMonths
  const quality: SignalQuality = band(
    months,
    [
      [24, 'good' as const],
      [12, 'fair' as const],
    ],
    'poor',
  )
  return {
    key: 'tenure',
    label: 'Wallet tenure',
    value: `${months} mo`,
    interpretation:
      months >= 24
        ? `${Math.floor(months / 12)} years of wallet history to assess — a long, readable track record.`
        : months >= 12
          ? 'Over a year of history, enough to judge a pattern.'
          : 'A short history, so there is less evidence behind any assessment.',
    quality,
    explain:
      'How long the mobile wallet has been open. A longer record means more behaviour to read and less room for a manufactured history.',
  }
}

export function readActivityDensity(f: FullFeatures): SignalReading {
  const d = f.activityDensity
  const quality: SignalQuality = band(
    d,
    [
      [0.4, 'good' as const],
      [0.15, 'fair' as const],
    ],
    'poor',
  )
  return {
    key: 'activity_density',
    label: 'Wallet activity',
    value: formatPercent(d, { decimals: 0 }),
    interpretation:
      d >= 0.4
        ? 'Uses the wallet on most days — this is their primary way of handling money.'
        : d >= 0.15
          ? 'Uses the wallet regularly, alongside cash.'
          : 'Uses the wallet only occasionally, so much of their activity is invisible to us.',
    quality,
    explain:
      'The share of days with at least one transaction. Someone who runs their life through the wallet gives us far more to read.',
  }
}

export function readSavingsRate(f: FullFeatures): SignalReading {
  const r = f.savingsRate
  const quality: SignalQuality = r >= 0.15 ? 'good' : r >= 0.03 ? 'fair' : 'poor'
  return {
    key: 'savings_rate',
    label: 'Money kept',
    value: formatPercent(r, { decimals: 0 }),
    interpretation:
      r >= 0.15
        ? `Keeps about ${formatPercent(r, { decimals: 0 })} of what comes in — clear room for an instalment.`
        : r >= 0.03
          ? 'Keeps a small margin each month; an instalment would need to be modest.'
          : 'Spends everything that comes in, leaving no headroom for a repayment.',
    quality,
    explain:
      'What is left after everything they spend, as a share of income. This is the headroom a monthly instalment has to fit into.',
  }
}

export function readCashOut(f: FullFeatures): SignalReading {
  const r = f.cashOutRatio
  // Not a moral judgement — high cash-out simply means we can see less.
  const quality: SignalQuality = r <= 0.3 ? 'good' : r <= 0.55 ? 'fair' : 'poor'
  return {
    key: 'cash_out',
    label: 'Taken as cash',
    value: formatPercent(r, { decimals: 0 }),
    interpretation:
      r <= 0.3
        ? 'Most spending stays digital, so we can see where the money goes.'
        : r <= 0.55
          ? 'A meaningful share is withdrawn as cash and becomes invisible to us.'
          : 'Most income is withdrawn as cash, so our view of their spending is limited.',
    quality,
    explain:
      'The share of income withdrawn as physical cash. Not a bad thing in itself — it just means less of their behaviour is observable.',
  }
}

export function readDormancy(f: FullFeatures): SignalReading {
  const days = f.daysSinceLastTransaction ?? 999
  const quality: SignalQuality = days <= 7 ? 'good' : days <= 30 ? 'fair' : 'poor'
  return {
    key: 'dormancy',
    label: 'Last activity',
    value: days === 0 ? 'Today' : pluralize(days, 'day ago', 'days ago'),
    interpretation:
      days <= 7
        ? 'Active in the last week — the account is live.'
        : days <= 30
          ? 'Last used within the month.'
          : `No wallet activity for ${days} days. The account may have gone dormant.`,
    quality,
    explain:
      'Days since the last wallet transaction. A wallet going quiet is one of the first signs something has changed.',
  }
}

export function readIncomeConcentration(f: FullFeatures): SignalReading {
  const sources = f.distinctIncomeSources
  const quality: SignalQuality = sources >= 4 ? 'good' : sources >= 2 ? 'fair' : 'poor'
  return {
    key: 'income_sources',
    label: 'Income sources',
    value: String(sources),
    interpretation:
      sources >= 4
        ? `Paid by ${sources} different counterparties — losing one would not end their income.`
        : sources >= 2
          ? `Income comes from ${sources} sources; losing one would hurt.`
          : sources === 1
            ? 'All income comes from a single payer — a concentration risk.'
            : 'No identifiable recurring payer.',
    quality,
    explain:
      'How many distinct counterparties pay this person. One source means their whole income disappears if that relationship ends.',
  }
}

/**
 * The headline readings for the applicant view, ordered as a loan officer
 * would want to read them: can they earn, do they pay, can we see them.
 */
export function readAllSignals(f: FullFeatures): SignalReading[] {
  return [
    readIncomeRegularity(f),
    readIncomeVolatility(f),
    readIncomeTrend(f),
    readBillPunctuality(f),
    readSavingsRate(f),
    readTenure(f),
    readActivityDensity(f),
    readIncomeConcentration(f),
    readCashOut(f),
    readDormancy(f),
  ]
}

/**
 * One sentence summarising what the signals say, for the top of the profile.
 * Deliberately hedged — this is a description of behaviour, not a decision.
 * The decision comes from the scorecard in Phase 3.
 */
export function summariseProfile(f: FullFeatures, name: string): string {
  const readings = readAllSignals(f)
  const good = readings.filter((r) => r.quality === 'good').length
  const poor = readings.filter((r) => r.quality === 'poor').length

  const incomeDesc =
    f.incomeVolatility <= 0.35 ? 'steady' : f.incomeVolatility <= 0.7 ? 'variable' : 'highly variable'

  const base =
    `${name} has ${f.walletTenureMonths} months of wallet history showing ${incomeDesc} income ` +
    `averaging ${formatPKR(f.avgMonthlyInflow)} a month, and paid ` +
    `${f.billsPaidOnTime} of ${f.billsTotal} utility bills on time.`

  if (poor === 0 && good >= 6) {
    return `${base} Every signal we can read points the same way: this is dependable behaviour.`
  }
  if (poor >= 4) {
    return `${base} Several signals give cause for concern — read the detail below before deciding.`
  }
  return `${base} The picture is mixed, with ${good} positive and ${poor} concerning signals.`
}
