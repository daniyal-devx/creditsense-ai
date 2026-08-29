import type { CustomerFeatures } from '@/lib/features/types'
import { getRiskBand } from '@/lib/risk'
import { formatPKR, formatPercent, pluralize } from '@/lib/utils/format'

/**
 * Early-warning detection.
 *
 * The failure this exists to prevent: a lender approves someone on good
 * signals, hears nothing, and finds out there is a problem when a payment is
 * missed — by which point the money is already gone and the only remaining
 * options are collection ones.
 *
 * The signals that precede a default are visible weeks earlier. Income stops
 * arriving. Bills start slipping. The wallet goes quiet. Each of those is
 * observable in data we already have, and each gives a lender a window in
 * which restructuring is still possible and a customer relationship is still
 * salvageable.
 *
 * So every rule here is written to fire on *change*, not on level. A customer
 * who has always been marginal is not news; a customer who was fine last month
 * and is not now is the entire point.
 */

export type AlertType =
  | 'income_collapse'
  | 'missed_bill_streak'
  | 'wallet_dormancy'
  | 'score_deterioration'
  | 'affordability_breach'
  | 'repayment_missed'
  | 'balance_depletion'

export type AlertSeverity = 'critical' | 'high' | 'medium' | 'low'

export interface EarlyWarningAlert {
  type: AlertType
  severity: AlertSeverity
  title: string
  /** What changed, with the numbers. Written for a person, not a log. */
  detail: string
  /** What the analyst should actually do. An alert with no action is noise. */
  recommendedAction: string
  evidence: Record<string, unknown>
  scoreAtAlert?: number
  scoreChange?: number
}

export interface MonitoringInput {
  customerId: string
  customerName: string
  features: CustomerFeatures
  currentScore: number | null
  /** The score before the most recent one, for detecting movement. */
  previousScore: number | null
  /** Days since the previous score was taken. */
  daysSincePreviousScore: number | null
  loan: {
    id: string
    reference: string
    outstandingBalance: number
    instalmentAmount: number
    status: string
    missedInstalments: number
    nextDueDate: Date | null
  } | null
}

// ---------------------------------------------------------------------------
// Detectors
// ---------------------------------------------------------------------------

/**
 * Income has fallen sharply against the previous quarter.
 *
 * The single strongest predictor of a coming default in this dataset, and the
 * one that gives the most warning: income stops before payments do, because
 * people run down savings first.
 */
function detectIncomeCollapse(input: MonitoringInput): EarlyWarningAlert | null {
  const { features } = input
  const trend = features.incomeTrend90d

  // With no prior period the trend defaults to 1.0, so this cannot fire on a
  // new customer who simply has no history to compare against.
  if (features.monthsWithIncome < 3) return null

  /**
   * The threshold is relative to the customer's own volatility, not absolute.
   *
   * A fixed cut-off is wrong for this population in both directions. A
   * freelancer whose income routinely swings 60% between quarters would alert
   * constantly on ordinary variation, while a shopkeeper with near-salary
   * regularity could fall 25% — genuinely alarming for them — and never fire.
   *
   * A first version used a flat 0.75 and raised 74 income alerts across 251
   * monitored customers. An early-warning feed where a quarter of the book is
   * flagged is one nobody reads, and an unread alert is worse than none.
   *
   * So: a steady earner (volatility 0.3) alerts at a 30% drop; a highly
   * volatile one (1.0) only at 60%. Both are then genuinely unusual FOR THEM.
   */
  const tolerance = Math.max(0.3, Math.min(0.6, features.incomeVolatility * 0.9))
  const alertBelow = 1 - tolerance
  if (trend >= alertBelow) return null

  const dropPercent = Math.round((1 - trend) * 100)

  // Severity is also relative: "twice as bad as their normal swing" means
  // something; "below 0.4" does not.
  const severityRatio = (1 - trend) / tolerance
  const severity: AlertSeverity =
    severityRatio >= 1.6 ? 'critical' : severityRatio >= 1.25 ? 'high' : 'medium'

  return {
    type: 'income_collapse',
    severity,
    title: `Income down ${dropPercent}% this quarter`,
    detail: `Earnings over the last 90 days are ${dropPercent}% below the 90 days before. Monthly income has fallen to about ${formatPKR(features.avgMonthlyInflow)}.`,
    recommendedAction:
      input.loan !== null
        ? `Contact the customer before the next instalment falls due. A restructure now costs far less than a collection later.`
        : 'Any live application should be re-assessed — the affordability figures behind it are out of date.',
    evidence: {
      incomeTrend90d: Number(trend.toFixed(3)),
      dropPercent,
      currentMonthlyIncome: Math.round(features.avgMonthlyInflow),
      recent90DayIncome: features.raw?.recent90DayIncome,
      prior90DayIncome: features.raw?.prior90DayIncome,
    },
  }
}

/**
 * Bills going unpaid in consecutive recent months.
 *
 * This has to fire on *change*, not on level. A customer who has always paid
 * 60% of their bills on time is a known quantity — they were underwritten that
 * way, and re-flagging them every cycle tells the lender nothing new. A
 * customer who has always paid everything and has now missed two months in a
 * row is a genuine warning.
 *
 * An earlier version alerted on any streak of two and produced 78 alerts
 * across 251 customers, most of them for people whose payment record had not
 * changed at all.
 */
function detectMissedBillStreak(input: MonitoringInput): EarlyWarningAlert | null {
  const { features } = input
  const streak = features.currentMissedStreak
  if (streak < 2) return null

  // Someone who normally pays well: two months is already out of character.
  // Someone with a patchy record: it takes a longer run to mean anything.
  const normallyReliable = features.billPunctuality >= 0.8
  const minimumStreak = normallyReliable ? 2 : 4
  if (streak < minimumStreak) return null

  const severity: AlertSeverity =
    streak >= 4 && !normallyReliable
      ? 'high'
      : streak >= 4
        ? 'critical'
        : normallyReliable
          ? 'high'
          : 'medium'

  return {
    type: 'missed_bill_streak',
    severity,
    title: `${pluralize(streak, 'consecutive month')} with a missed bill`,
    detail: normallyReliable
      ? `A utility bill has been missed or paid late in each of the last ${pluralize(streak, 'month')} — out of character for someone who has paid ${formatPercent(features.billPunctuality, { decimals: 0 })} of their bills on time.`
      : `A utility bill has been missed or paid late in each of the last ${pluralize(streak, 'month')}. Overall punctuality is ${formatPercent(features.billPunctuality, { decimals: 0 })}.`,
    recommendedAction:
      'Utilities are usually the last thing people stop paying. A streak here means the household is already choosing which bills to let go.',
    evidence: {
      currentMissedStreak: streak,
      billPunctuality: Number(features.billPunctuality.toFixed(3)),
      normallyReliable,
      billsUnpaid: features.billsUnpaid,
      worstDaysLate: features.worstDaysLate,
    },
  }
}

/**
 * The wallet has gone quiet.
 *
 * Ambiguous on its own — someone may simply have switched to cash — but a
 * borrower whose account we can no longer observe is a borrower we can no
 * longer monitor, which is itself a risk worth flagging.
 */
function detectWalletDormancy(input: MonitoringInput): EarlyWarningAlert | null {
  const days = input.features.daysSinceLastTransaction
  if (days === null || days < 21) return null

  const severity: AlertSeverity = days >= 60 ? 'high' : days >= 35 ? 'medium' : 'low'

  return {
    type: 'wallet_dormancy',
    severity,
    title: `No wallet activity for ${days} days`,
    detail: `Nothing has moved through this wallet since ${days} days ago. Previously the account was used on ${formatPercent(input.features.activityDensity, { decimals: 0 })} of days.`,
    recommendedAction:
      'Check the customer is contactable. They may have moved to cash, changed number, or stopped earning — and we cannot tell which from the data alone.',
    evidence: {
      daysSinceLastTransaction: days,
      historicalActivityDensity: Number(input.features.activityDensity.toFixed(3)),
      longestDormancyDays: input.features.longestDormancyDays,
    },
  }
}

/**
 * The score has dropped materially since it was last taken.
 *
 * Deliberately measured in points rather than bands: waiting for a band change
 * loses the warning entirely for someone who falls 90 points but starts near
 * the top of their band.
 */
function detectScoreDeterioration(input: MonitoringInput): EarlyWarningAlert | null {
  const { currentScore, previousScore } = input
  if (currentScore === null || previousScore === null) return null

  const change = currentScore - previousScore
  if (change > -40) return null

  const fromBand = getRiskBand(previousScore)
  const toBand = getRiskBand(currentScore)
  const crossedBand = fromBand.id !== toBand.id

  const severity: AlertSeverity =
    change <= -120 || (crossedBand && (toBand.id === 'high' || toBand.id === 'very-high'))
      ? 'critical'
      : change <= -80
        ? 'high'
        : 'medium'

  return {
    type: 'score_deterioration',
    severity,
    title: crossedBand
      ? `Score fell ${Math.abs(change)} points — now ${toBand.label}`
      : `Score fell ${Math.abs(change)} points`,
    detail: crossedBand
      ? `Dropped from ${previousScore} to ${currentScore}, moving from ${fromBand.label} to ${toBand.label}.`
      : `Dropped from ${previousScore} to ${currentScore}, still within ${toBand.label}.`,
    recommendedAction: crossedBand
      ? 'Re-check affordability before any further exposure. The terms this customer was approved on no longer reflect their position.'
      : 'Watch the underlying signals — a fall this size usually has one specific cause behind it.',
    evidence: {
      previousScore,
      currentScore,
      change,
      fromBand: fromBand.id,
      toBand: toBand.id,
      daysBetween: input.daysSincePreviousScore,
    },
    scoreAtAlert: currentScore,
    scoreChange: change,
  }
}

/**
 * The instalment they are committed to no longer fits their income.
 *
 * Compares the actual instalment against a debt-service ratio computed on
 * current income, so it fires when income falls even if nothing has been
 * missed yet — which is exactly the warning window worth having.
 */
function detectAffordabilityBreach(input: MonitoringInput): EarlyWarningAlert | null {
  if (!input.loan) return null

  const { instalmentAmount } = input.loan
  const income = input.features.medianMonthlyInflow || input.features.avgMonthlyInflow
  if (income <= 0 || instalmentAmount <= 0) return null

  const ratio = instalmentAmount / income
  // 0.4 is well past the 0.35 the loan was written under; below that this is
  // ordinary tightness rather than a breach.
  if (ratio < 0.4) return null

  const severity: AlertSeverity = ratio >= 0.7 ? 'critical' : ratio >= 0.55 ? 'high' : 'medium'

  return {
    type: 'affordability_breach',
    severity,
    title: `Instalment now ${formatPercent(ratio, { decimals: 0 })} of income`,
    detail: `The ${formatPKR(instalmentAmount)} monthly instalment now takes ${formatPercent(ratio, { decimals: 0 })} of a typical month's income of ${formatPKR(income)}. It was written to stay under 35%.`,
    recommendedAction:
      'Consider extending the term to lower the instalment. Restructuring before a miss keeps the loan performing and the customer reachable.',
    evidence: {
      instalmentAmount,
      currentMonthlyIncome: Math.round(income),
      debtServiceRatio: Number(ratio.toFixed(3)),
      writtenUnderRatio: 0.35,
      outstandingBalance: input.loan.outstandingBalance,
    },
  }
}

/** Instalments actually missed. The alert that arrives too late — but must still arrive. */
function detectRepaymentMissed(input: MonitoringInput): EarlyWarningAlert | null {
  if (!input.loan || input.loan.missedInstalments === 0) return null

  const missed = input.loan.missedInstalments
  const severity: AlertSeverity = missed >= 3 ? 'critical' : missed >= 2 ? 'high' : 'medium'

  return {
    type: 'repayment_missed',
    severity,
    title: `${pluralize(missed, 'instalment')} missed`,
    detail: `Loan ${input.loan.reference} has ${pluralize(missed, 'missed instalment')} against an outstanding balance of ${formatPKR(input.loan.outstandingBalance)}.`,
    recommendedAction:
      missed >= 3
        ? 'Escalate to collections. At three missed instalments the loan meets the usual definition of default.'
        : 'Contact the customer directly before the next due date.',
    evidence: {
      loanReference: input.loan.reference,
      missedInstalments: missed,
      outstandingBalance: input.loan.outstandingBalance,
      loanStatus: input.loan.status,
    },
  }
}

/** Repeatedly running the wallet down to nothing. */
function detectBalanceDepletion(input: MonitoringInput): EarlyWarningAlert | null {
  const { features } = input
  if (features.observationDays < 60) return null

  const zeroDayShare = features.daysWithZeroBalance / Math.max(1, features.activeDays)
  if (zeroDayShare < 0.3 || features.daysWithZeroBalance < 15) return null

  const severity: AlertSeverity = zeroDayShare >= 0.6 ? 'high' : 'medium'

  return {
    type: 'balance_depletion',
    severity,
    title: 'Wallet repeatedly runs down to nothing',
    detail: `The balance fell below Rs 100 on ${features.daysWithZeroBalance} of ${features.activeDays} active days — ${formatPercent(zeroDayShare, { decimals: 0 })} of the time.`,
    recommendedAction:
      'There is no buffer here. Any unexpected cost lands directly on the instalment, so a single bad week can cause a miss.',
    evidence: {
      daysWithZeroBalance: features.daysWithZeroBalance,
      activeDays: features.activeDays,
      shareOfActiveDays: Number(zeroDayShare.toFixed(3)),
      avgEndOfMonthBalance: Math.round(features.avgEndOfMonthBalance),
    },
  }
}

const DETECTORS: ((input: MonitoringInput) => EarlyWarningAlert | null)[] = [
  detectIncomeCollapse,
  detectScoreDeterioration,
  detectRepaymentMissed,
  detectAffordabilityBreach,
  detectMissedBillStreak,
  detectWalletDormancy,
  detectBalanceDepletion,
]

const SEVERITY_ORDER: Record<AlertSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
}

export function detectEarlyWarnings(input: MonitoringInput): EarlyWarningAlert[] {
  const alerts: EarlyWarningAlert[] = []

  for (const detector of DETECTORS) {
    try {
      const alert = detector(input)
      if (alert) alerts.push(alert)
    } catch (err) {
      // One detector failing must not suppress the others. A monitoring run
      // that silently reports "all clear" because of a bug is the worst
      // possible failure mode for this module.
      console.error(`[monitoring] detector failed for ${input.customerId}:`, err)
    }
  }

  return alerts.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
}

export const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  income_collapse: 'Income collapse',
  missed_bill_streak: 'Missed bills',
  wallet_dormancy: 'Wallet dormant',
  score_deterioration: 'Score falling',
  affordability_breach: 'Affordability breach',
  repayment_missed: 'Repayment missed',
  balance_depletion: 'No buffer left',
}

/**
 * One sentence summarising a customer's alerts, for the portfolio feed.
 *
 * Leads with what the lender should do, because a feed of descriptions is a
 * feed nobody acts on.
 */
export function summariseAlerts(alerts: EarlyWarningAlert[], customerName: string): string {
  if (alerts.length === 0) return 'No warning signals.'

  const firstName = customerName.split(' ')[0]
  const critical = alerts.filter((a) => a.severity === 'critical')

  if (critical.length > 0) {
    return `${firstName} needs contacting now — ${critical[0].title.toLowerCase()}.`
  }

  const high = alerts.filter((a) => a.severity === 'high')
  if (high.length > 0) {
    return `${firstName} is deteriorating: ${high[0].title.toLowerCase()}.`
  }

  return `${firstName} has ${pluralize(alerts.length, 'early-warning signal')} worth watching.`
}
