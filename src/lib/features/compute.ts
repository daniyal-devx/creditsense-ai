import {
  INCOME_CATEGORIES,
  type CustomerFeatures,
  type MonthlyBucket,
  type RawBillPayment,
  type RawWalletTransaction,
  type SignalBundle,
} from './types'

/**
 * The feature engineering layer.
 *
 * Pure functions over plain data — no database, no framework, no I/O — so the
 * same code runs in the batch job, in an API route, and in a unit test, and
 * always produces the same numbers.
 *
 * A recurring judgement call in here: what counts as *income*. Money arriving
 * in a wallet is not the same as money earned. A P2P transfer from a friend, a
 * refund, and a loan disbursement all increase the balance while telling you
 * nothing about capacity to repay — and treating them as income is exactly how
 * a fraud ring cycling money between five accounts would manufacture a good
 * score. So income is restricted to the categories that represent someone
 * being paid for something, and transfers are tracked separately.
 */

const INCOME_SET = new Set<string>(INCOME_CATEGORIES)
const DAY_MS = 86_400_000

// ---------------------------------------------------------------------------
// Small statistics helpers
// ---------------------------------------------------------------------------

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0)
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : sum(values) / values.length
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0
  const m = mean(values)
  // Sample standard deviation: we are looking at a sample of months, not the
  // complete history of the person's life.
  return Math.sqrt(sum(values.map((v) => (v - m) ** 2)) / (values.length - 1))
}

function round(value: number, dp = 2): number {
  if (!Number.isFinite(value)) return 0
  const factor = 10 ** dp
  return Math.round(value * factor) / factor
}

/** Guards every ratio in this file against a zero denominator. */
function ratio(numerator: number, denominator: number, fallback = 0): number {
  if (!denominator || !Number.isFinite(denominator)) return fallback
  return numerator / denominator
}

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

// ---------------------------------------------------------------------------
// Monthly bucketing — used by both the features and the UI charts
// ---------------------------------------------------------------------------

export function bucketByMonth(
  transactions: RawWalletTransaction[],
  windowStart: Date,
  windowEnd: Date,
): MonthlyBucket[] {
  const buckets = new Map<string, MonthlyBucket>()

  // Pre-create every month in the window so a month with no activity shows up
  // as a real zero rather than silently disappearing from the series — which
  // would make a dormant customer look merely "shorter", not inactive.
  const cursor = new Date(Date.UTC(windowStart.getUTCFullYear(), windowStart.getUTCMonth(), 1))
  const last = new Date(Date.UTC(windowEnd.getUTCFullYear(), windowEnd.getUTCMonth(), 1))
  while (cursor <= last) {
    buckets.set(monthKey(cursor), {
      month: monthKey(cursor),
      inflow: 0,
      outflow: 0,
      net: 0,
      transactionCount: 0,
    })
    cursor.setUTCMonth(cursor.getUTCMonth() + 1)
  }

  for (const tx of transactions) {
    const key = monthKey(tx.occurredAt)
    const bucket = buckets.get(key)
    if (!bucket) continue

    bucket.transactionCount++
    if (tx.direction === 'in') {
      if (INCOME_SET.has(tx.category)) bucket.inflow += tx.amount
    } else {
      bucket.outflow += tx.amount
    }
  }

  for (const bucket of buckets.values()) {
    bucket.inflow = round(bucket.inflow)
    bucket.outflow = round(bucket.outflow)
    bucket.net = round(bucket.inflow - bucket.outflow)
  }

  return [...buckets.values()].sort((a, b) => a.month.localeCompare(b.month))
}

// ---------------------------------------------------------------------------
// Bill payment behaviour
// ---------------------------------------------------------------------------

function computeBillFeatures(bills: RawBillPayment[]) {
  const total = bills.length
  const onTime = bills.filter((b) => b.status === 'paid_on_time').length
  const late = bills.filter((b) => b.status === 'paid_late').length
  const unpaid = bills.filter((b) => b.status === 'unpaid').length

  const lateDays = bills
    .filter((b) => b.status === 'paid_late' && b.paidAt)
    .map((b) => Math.max(0, Math.round((b.paidAt!.getTime() - b.dueDate.getTime()) / DAY_MS)))

  /**
   * Streaks are counted over *months*, not over individual bills: a household
   * with three utilities that misses one month should read as one missed
   * month, not three missed bills in a row.
   *
   * Bills that came due within the last two weeks are excluded from the streak
   * entirely. An unpaid bill from last Tuesday has not been *missed* — it has
   * not been paid *yet*, and most people pay a few days after the due date.
   * Counting it produced a phantom streak for a large share of the portfolio
   * at any given moment, which flooded Phase 6's early-warning feed with
   * alerts about people who were behaving completely normally.
   *
   * They still count against overall punctuality — that is a rate, not a
   * judgement about right now.
   */
  const GRACE_DAYS = 14
  const graceCutoff = new Date(Date.now() - GRACE_DAYS * DAY_MS)

  const byMonth = new Map<string, RawBillPayment[]>()
  for (const bill of bills) {
    if (bill.status === 'unpaid' && bill.dueDate > graceCutoff) continue
    const key = monthKey(bill.billingMonth)
    const list = byMonth.get(key)
    if (list) list.push(bill)
    else byMonth.set(key, [bill])
  }

  const months = [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  const monthMissed = months.map(([, monthBills]) =>
    monthBills.some((b) => b.status === 'unpaid' || b.status === 'paid_late'),
  )

  let longestMissedStreak = 0
  let running = 0
  for (const missed of monthMissed) {
    running = missed ? running + 1 : 0
    longestMissedStreak = Math.max(longestMissedStreak, running)
  }

  // The current streak runs backwards from the most recent month — this is the
  // one that says "there is a live problem right now".
  let currentMissedStreak = 0
  for (let i = monthMissed.length - 1; i >= 0; i--) {
    if (!monthMissed[i]) break
    currentMissedStreak++
  }

  return {
    billsTotal: total,
    billsPaidOnTime: onTime,
    billsPaidLate: late,
    billsUnpaid: unpaid,
    // An unpaid bill counts fully against punctuality; a late one is already
    // excluded from the numerator.
    billPunctuality: round(ratio(onTime, total), 4),
    avgDaysLate: round(mean(lateDays), 2),
    worstDaysLate: lateDays.length ? Math.max(...lateDays) : 0,
    currentMissedStreak,
    longestMissedStreak,
    distinctBillers: new Set(bills.map((b) => `${b.billerType}:${b.billerName}`)).size,
  }
}

// ---------------------------------------------------------------------------
// The main entry point
// ---------------------------------------------------------------------------

export function computeFeatures(bundle: SignalBundle, asOf: Date = new Date()): CustomerFeatures {
  const { transactions, bills, topups, loans, repayments, walletOpenedAt } = bundle

  const windowEnd = asOf
  // Observe from whichever is later: 12 months back, or the day the wallet was
  // opened. Averaging a 3-month-old account over 12 months would understate
  // their income by 4x and reject someone for being new.
  const twelveMonthsAgo = new Date(windowEnd)
  twelveMonthsAgo.setUTCMonth(twelveMonthsAgo.getUTCMonth() - 12)
  const windowStart = walletOpenedAt > twelveMonthsAgo ? walletOpenedAt : twelveMonthsAgo

  const inWindow = transactions.filter(
    (t) => t.occurredAt >= windowStart && t.occurredAt <= windowEnd,
  )

  const observationDays = Math.max(
    1,
    Math.round((windowEnd.getTime() - windowStart.getTime()) / DAY_MS),
  )
  const observationMonths = Math.max(1, observationDays / 30.44)

  // ---- income ----
  const incomeTx = inWindow.filter((t) => t.direction === 'in' && INCOME_SET.has(t.category))
  const outflowTx = inWindow.filter((t) => t.direction === 'out')

  const totalInflow = sum(incomeTx.map((t) => t.amount))
  const totalOutflow = sum(outflowTx.map((t) => t.amount))

  const buckets = bucketByMonth(inWindow, windowStart, windowEnd)
  // Drop the current, incomplete month from the statistics — it is always
  // partial and would drag every average and trend down for no real reason.
  const completeBuckets =
    buckets.length > 1 && monthKey(windowEnd) === buckets[buckets.length - 1].month
      ? buckets.slice(0, -1)
      : buckets

  const monthlyInflows = completeBuckets.map((b) => b.inflow)
  const monthlyOutflows = completeBuckets.map((b) => b.outflow)

  const avgMonthlyInflow = mean(monthlyInflows)
  const monthsWithIncome = monthlyInflows.filter((v) => v > 0).length

  // Coefficient of variation. Dividing by the mean is what makes it comparable
  // across a 40k earner and a 400k earner.
  const incomeVolatility = ratio(stdDev(monthlyInflows), avgMonthlyInflow)

  // ---- 90-day trend ----
  const ninetyDaysAgo = new Date(windowEnd.getTime() - 90 * DAY_MS)
  const oneEightyDaysAgo = new Date(windowEnd.getTime() - 180 * DAY_MS)
  const recent90 = sum(
    incomeTx.filter((t) => t.occurredAt >= ninetyDaysAgo).map((t) => t.amount),
  )
  const prior90 = sum(
    incomeTx
      .filter((t) => t.occurredAt >= oneEightyDaysAgo && t.occurredAt < ninetyDaysAgo)
      .map((t) => t.amount),
  )
  // With no prior period to compare against, 1.0 ("flat") is the only honest
  // answer — claiming a trend from a single window would be an invention.
  const incomeTrend90d = prior90 > 0 ? recent90 / prior90 : 1

  // ---- liquidity ----
  const cashOutTotal = sum(
    inWindow.filter((t) => t.category === 'cash_out').map((t) => t.amount),
  )

  const balancesByMonth = new Map<string, { at: Date; balance: number }>()
  for (const tx of inWindow) {
    if (tx.balanceAfter === null) continue
    const key = monthKey(tx.occurredAt)
    const current = balancesByMonth.get(key)
    if (!current || tx.occurredAt > current.at) {
      balancesByMonth.set(key, { at: tx.occurredAt, balance: tx.balanceAfter })
    }
  }
  const avgEndOfMonthBalance = mean([...balancesByMonth.values()].map((v) => v.balance))

  // "Zero balance" means functionally empty, not literally zero — anyone who
  // has ever been down to their last 100 rupees knows the difference does not
  // matter.
  const zeroBalanceDays = new Set(
    inWindow.filter((t) => t.balanceAfter !== null && t.balanceAfter < 100).map((t) => dayKey(t.occurredAt)),
  ).size

  // ---- engagement ----
  const activeDayKeys = [...new Set(inWindow.map((t) => dayKey(t.occurredAt)))].sort()
  const activeDays = activeDayKeys.length

  let longestDormancyDays = 0
  if (activeDayKeys.length > 0) {
    // Include the gap before the first transaction and after the last one — a
    // wallet that went quiet two months ago is dormant now, and only the
    // trailing gap captures that.
    let previous = windowStart.getTime()
    for (const key of activeDayKeys) {
      const current = new Date(`${key}T00:00:00.000Z`).getTime()
      longestDormancyDays = Math.max(longestDormancyDays, Math.round((current - previous) / DAY_MS))
      previous = current
    }
    longestDormancyDays = Math.max(
      longestDormancyDays,
      Math.round((windowEnd.getTime() - previous) / DAY_MS),
    )
  } else {
    longestDormancyDays = observationDays
  }

  const lastTransaction = inWindow.reduce<Date | null>(
    (latest, t) => (latest === null || t.occurredAt > latest ? t.occurredAt : latest),
    null,
  )

  // ---- top-ups ----
  const topupsInWindow = topups.filter(
    (t) => t.occurredAt >= windowStart && t.occurredAt <= windowEnd,
  )
  const topupMonths = new Set(topupsInWindow.map((t) => monthKey(t.occurredAt))).size
  const lastTopup = topupsInWindow.reduce<Date | null>(
    (latest, t) => (latest === null || t.occurredAt > latest ? t.occurredAt : latest),
    null,
  )

  // ---- bills ----
  const billsInWindow = bills.filter(
    (b) => b.billingMonth >= windowStart && b.billingMonth <= windowEnd,
  )
  const billFeatures = computeBillFeatures(billsInWindow)

  // ---- obligations ----
  const activeLoans = loans.filter((l) => l.status === 'active' || l.status === 'delinquent')
  const settledRepayments = repayments.filter((r) => r.status !== 'due')
  const onTimeRepayments = settledRepayments.filter((r) => r.status === 'paid_on_time').length

  const walletTenureMonths = Math.max(
    0,
    Math.round((windowEnd.getTime() - walletOpenedAt.getTime()) / DAY_MS / 30.44),
  )

  const features: CustomerFeatures = {
    computedAt: new Date(),
    windowStart,
    windowEnd,
    observationDays,

    totalInflow: round(totalInflow),
    totalOutflow: round(totalOutflow),
    netFlow: round(totalInflow - totalOutflow),
    avgMonthlyInflow: round(avgMonthlyInflow),
    medianMonthlyInflow: round(median(monthlyInflows)),
    incomeVolatility: round(incomeVolatility, 4),
    incomeRegularity: round(ratio(monthsWithIncome, completeBuckets.length), 4),
    monthsWithIncome,
    incomeTrend90d: round(incomeTrend90d, 4),
    largestSingleInflow: round(incomeTx.length ? Math.max(...incomeTx.map((t) => t.amount)) : 0),
    distinctIncomeSources: new Set(
      incomeTx.map((t) => t.counterpartyRef).filter((r): r is string => r !== null),
    ).size,

    cashOutRatio: round(ratio(cashOutTotal, totalInflow), 4),
    avgMonthlyOutflow: round(mean(monthlyOutflows)),
    savingsRate: round(ratio(totalInflow - totalOutflow, totalInflow), 4),
    avgEndOfMonthBalance: round(avgEndOfMonthBalance),
    daysWithZeroBalance: zeroBalanceDays,

    ...billFeatures,

    topupCount: topupsInWindow.length,
    avgMonthlyTopupAmount: round(ratio(sum(topupsInWindow.map((t) => t.amount)), observationMonths)),
    topupRegularity: round(ratio(topupMonths, Math.max(1, completeBuckets.length)), 4),
    daysSinceLastTopup: lastTopup
      ? Math.round((windowEnd.getTime() - lastTopup.getTime()) / DAY_MS)
      : null,

    walletTenureMonths,
    transactionCount: inWindow.length,
    activeDays,
    activityDensity: round(ratio(activeDays, observationDays), 4),
    daysSinceLastTransaction: lastTransaction
      ? Math.round((windowEnd.getTime() - lastTransaction.getTime()) / DAY_MS)
      : null,
    longestDormancyDays,

    activeLoanCount: activeLoans.length,
    totalOutstanding: round(sum(activeLoans.map((l) => l.outstandingBalance))),
    historicalRepayments: settledRepayments.length,
    historicalOnTimeRate:
      settledRepayments.length > 0
        ? round(ratio(onTimeRepayments, settledRepayments.length), 4)
        : null,

    raw: {},
  }

  // Keep the working values that produced the summary, so a decision can be
  // reconstructed later without re-reading 40,000 transactions.
  features.raw = {
    monthlyBuckets: buckets,
    completeMonthCount: completeBuckets.length,
    recent90DayIncome: round(recent90),
    prior90DayIncome: round(prior90),
    cashOutTotal: round(cashOutTotal),
    transferInTotal: round(
      sum(inWindow.filter((t) => t.direction === 'in' && !INCOME_SET.has(t.category)).map((t) => t.amount)),
    ),
    declaredVsObservedNote:
      'Income excludes P2P transfers, refunds and loan disbursements — money arriving is not money earned.',
  }

  return features
}

/**
 * Turn the feature vector into the column shape `customer_features` expects.
 * Kept next to the computation so the two cannot drift apart.
 */
export function featuresToRow(customerId: string, f: CustomerFeatures): unknown[] {
  return [
    customerId,
    f.computedAt,
    f.windowStart.toISOString().slice(0, 10),
    f.windowEnd.toISOString().slice(0, 10),
    f.observationDays,
    f.totalInflow,
    f.totalOutflow,
    f.netFlow,
    f.avgMonthlyInflow,
    f.medianMonthlyInflow,
    f.incomeVolatility,
    f.incomeRegularity,
    f.monthsWithIncome,
    f.incomeTrend90d,
    f.largestSingleInflow,
    f.distinctIncomeSources,
    f.cashOutRatio,
    f.avgMonthlyOutflow,
    f.savingsRate,
    f.avgEndOfMonthBalance,
    f.daysWithZeroBalance,
    f.billsTotal,
    f.billsPaidOnTime,
    f.billsPaidLate,
    f.billsUnpaid,
    f.billPunctuality,
    f.avgDaysLate,
    f.worstDaysLate,
    f.currentMissedStreak,
    f.longestMissedStreak,
    f.distinctBillers,
    f.topupCount,
    f.avgMonthlyTopupAmount,
    f.topupRegularity,
    f.daysSinceLastTopup,
    f.walletTenureMonths,
    f.transactionCount,
    f.activeDays,
    f.activityDensity,
    f.daysSinceLastTransaction,
    f.longestDormancyDays,
    f.activeLoanCount,
    f.totalOutstanding,
    f.historicalRepayments,
    f.historicalOnTimeRate,
    JSON.stringify(f.raw),
  ]
}

export const FEATURE_COLUMNS = [
  'customer_id', 'computed_at', 'window_start', 'window_end', 'observation_days',
  'total_inflow', 'total_outflow', 'net_flow', 'avg_monthly_inflow', 'median_monthly_inflow',
  'income_volatility', 'income_regularity', 'months_with_income', 'income_trend_90d',
  'largest_single_inflow', 'distinct_income_sources',
  'cash_out_ratio', 'avg_monthly_outflow', 'savings_rate', 'avg_end_of_month_balance',
  'days_with_zero_balance',
  'bills_total', 'bills_paid_on_time', 'bills_paid_late', 'bills_unpaid', 'bill_punctuality',
  'avg_days_late', 'worst_days_late', 'current_missed_streak', 'longest_missed_streak',
  'distinct_billers',
  'topup_count', 'avg_monthly_topup_amount', 'topup_regularity', 'days_since_last_topup',
  'wallet_tenure_months', 'transaction_count', 'active_days', 'activity_density',
  'days_since_last_transaction', 'longest_dormancy_days',
  'active_loan_count', 'total_outstanding', 'historical_repayments', 'historical_on_time_rate',
  'raw',
] as const
