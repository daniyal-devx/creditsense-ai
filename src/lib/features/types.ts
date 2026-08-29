/**
 * The engineered feature vector.
 *
 * Raw transactions answer "what happened". This answers "what does that say
 * about them" — and it is the only thing downstream modules are allowed to
 * look at. Scoring (Phase 3), affordability (Phase 4) and monitoring (Phase 6)
 * all read from here, never from `wallet_transactions` directly, so that a
 * change in how a signal is derived happens in exactly one place.
 *
 * Every field is reproducible from the raw tables. That is what makes a score
 * defensible when someone asks, eight months later, why an application was
 * rejected.
 */

// ---------------------------------------------------------------------------
// Raw inputs — the minimum shape the computation needs. Deliberately not the
// database row types, so the feature engine can be unit-tested with literals.
// ---------------------------------------------------------------------------

export type WalletDirection = 'in' | 'out'

export const INCOME_CATEGORIES = [
  'salary',
  'client_payment',
  'sales_receipt',
  'remittance',
] as const

export const TRANSFER_IN_CATEGORIES = ['p2p_in', 'refund', 'loan_disbursement'] as const

export interface RawWalletTransaction {
  direction: WalletDirection
  category: string
  amount: number
  balanceAfter: number | null
  counterpartyRef: string | null
  occurredAt: Date
}

export interface RawBillPayment {
  billerType: string
  billerName: string
  billingMonth: Date
  dueDate: Date
  amountDue: number
  paidAt: Date | null
  status: 'paid_on_time' | 'paid_late' | 'unpaid'
}

export interface RawTopup {
  amount: number
  isRecurring: boolean
  occurredAt: Date
}

export interface RawLoanSummary {
  status: string
  outstandingBalance: number
}

export interface RawRepayment {
  status: string
  daysLate: number | null
}

export interface SignalBundle {
  walletOpenedAt: Date
  transactions: RawWalletTransaction[]
  bills: RawBillPayment[]
  topups: RawTopup[]
  loans: RawLoanSummary[]
  repayments: RawRepayment[]
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

export interface CustomerFeatures {
  computedAt: Date
  windowStart: Date
  windowEnd: Date
  observationDays: number

  // ---- income ----
  /** Total money in over the window, income categories only. */
  totalInflow: number
  totalOutflow: number
  netFlow: number
  avgMonthlyInflow: number
  /** Median is the honest headline for a lumpy earner; the mean flatters them. */
  medianMonthlyInflow: number
  /**
   * Coefficient of variation of monthly income (stdev / mean).
   * 0 is a perfectly regular salary; above ~0.6 the income is genuinely lumpy.
   */
  incomeVolatility: number
  /** 0–1. Share of observed months with any income at all. */
  incomeRegularity: number
  monthsWithIncome: number
  /** Last 90 days of income over the 90 before that. 1.0 is flat, 0.6 is a 40% drop. */
  incomeTrend90d: number
  largestSingleInflow: number
  /** Distinct paying counterparties — concentration risk if this is 1. */
  distinctIncomeSources: number

  // ---- spending & liquidity ----
  /** Share of inflow taken straight out as cash. High means we lose visibility. */
  cashOutRatio: number
  avgMonthlyOutflow: number
  /** (inflow − outflow) / inflow. The headroom an instalment has to fit into. */
  savingsRate: number
  avgEndOfMonthBalance: number
  daysWithZeroBalance: number

  // ---- bill payment behaviour ----
  billsTotal: number
  billsPaidOnTime: number
  billsPaidLate: number
  billsUnpaid: number
  /** 0–1. The single strongest repayment proxy a thin-file applicant has. */
  billPunctuality: number
  avgDaysLate: number
  worstDaysLate: number
  /** Consecutive most-recent months with a missed bill. Non-zero is a live problem. */
  currentMissedStreak: number
  longestMissedStreak: number
  distinctBillers: number

  // ---- top-up behaviour ----
  topupCount: number
  avgMonthlyTopupAmount: number
  /** 0–1. How consistently they keep the number topped up month to month. */
  topupRegularity: number
  daysSinceLastTopup: number | null

  // ---- tenure & engagement ----
  walletTenureMonths: number
  transactionCount: number
  activeDays: number
  /** Share of days in the window with at least one transaction. */
  activityDensity: number
  daysSinceLastTransaction: number | null
  longestDormancyDays: number

  // ---- existing obligations ----
  activeLoanCount: number
  totalOutstanding: number
  historicalRepayments: number
  /** null when they have never had a loan — which is the norm here. */
  historicalOnTimeRate: number | null

  /** Everything above plus intermediate values, kept for auditing a decision. */
  raw: Record<string, unknown>
}

/** A month bucket, exposed because the UI charts income month by month. */
export interface MonthlyBucket {
  month: string
  inflow: number
  outflow: number
  net: number
  transactionCount: number
}
