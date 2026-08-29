import 'server-only'
import { query, queryOne } from './client'
import { bucketByMonth } from '@/lib/features/compute'
import type { MonthlyBucket } from '@/lib/features/types'

/**
 * Reads for the customer / signal-profile surfaces.
 *
 * Everything here is a server-only module. Applicant financial records must
 * never be shipped to the browser wholesale — a page asks for the specific
 * slice it renders, and nothing more.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CustomerSummary {
  id: string
  fullName: string
  cnic: string
  phone: string
  city: string
  province: string
  occupation: string
  persona: string
  primaryWallet: string
  walletOpenedAt: Date
  declaredMonthlyIncome: number | null
  hasBankLoanHistory: boolean

  // From customer_features. Null when features have not been built yet.
  avgMonthlyInflow: number | null
  incomeVolatility: number | null
  incomeRegularity: number | null
  billPunctuality: number | null
  walletTenureMonths: number | null
  transactionCount: number | null
  activityDensity: number | null
  savingsRate: number | null
  daysSinceLastTransaction: number | null
  featuresComputedAt: Date | null

  pendingApplications: number
  activeLoans: number
  /** Current CreditSense score, or null if not scored yet. */
  score: number | null
  scoreBand: string | null
}

export interface CustomerDetail extends CustomerSummary {
  email: string | null
  dateOfBirth: Date
  gender: string
  address: string | null
  employmentType: string
  householdSize: number | null
  dependents: number | null
  educationLevel: string | null
  bureauScore: number | null
  deviceFingerprint: string | null
  simRegisteredAt: Date | null
}

export interface FullFeatures {
  computedAt: Date
  windowStart: Date
  windowEnd: Date
  observationDays: number
  totalInflow: number
  totalOutflow: number
  netFlow: number
  avgMonthlyInflow: number
  medianMonthlyInflow: number
  incomeVolatility: number
  incomeRegularity: number
  monthsWithIncome: number
  incomeTrend90d: number
  largestSingleInflow: number
  distinctIncomeSources: number
  cashOutRatio: number
  avgMonthlyOutflow: number
  savingsRate: number
  avgEndOfMonthBalance: number
  daysWithZeroBalance: number
  billsTotal: number
  billsPaidOnTime: number
  billsPaidLate: number
  billsUnpaid: number
  billPunctuality: number
  avgDaysLate: number
  worstDaysLate: number
  currentMissedStreak: number
  longestMissedStreak: number
  distinctBillers: number
  topupCount: number
  avgMonthlyTopupAmount: number
  topupRegularity: number
  daysSinceLastTopup: number | null
  walletTenureMonths: number
  transactionCount: number
  activeDays: number
  activityDensity: number
  daysSinceLastTransaction: number | null
  longestDormancyDays: number
  activeLoanCount: number
  totalOutstanding: number
  historicalRepayments: number
  historicalOnTimeRate: number | null
  monthlyBuckets: MonthlyBucket[]
}

export interface TransactionRow {
  id: string
  provider: string
  direction: 'in' | 'out'
  category: string
  amount: number
  balanceAfter: number | null
  counterpartyName: string | null
  description: string | null
  occurredAt: Date
}

export interface BillRow {
  id: string
  billerType: string
  billerName: string
  billingMonth: Date
  dueDate: Date
  amountDue: number
  paidAt: Date | null
  status: 'paid_on_time' | 'paid_late' | 'unpaid'
  daysLate: number | null
}

export interface TopupRow {
  id: string
  network: string
  amount: number
  productType: string
  isRecurring: boolean
  occurredAt: Date
}

// `numeric` arrives from pg as a string so no precision is lost in transit.
// It is converted exactly once, here, on the way out of the database.
const num = (v: string | number | null): number | null =>
  v === null || v === undefined ? null : Number(v)
const numOr0 = (v: string | number | null): number => Number(v ?? 0)

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export interface CustomerListFilters {
  search?: string
  persona?: string
  city?: string
  /** Only those with no bureau record — the thin-file population. */
  thinFileOnly?: boolean
  limit?: number
  offset?: number
}

export async function listCustomers(
  filters: CustomerListFilters = {},
): Promise<{ rows: CustomerSummary[]; total: number }> {
  const { search, persona, city, thinFileOnly, limit = 100, offset = 0 } = filters

  const conditions: string[] = []
  const params: unknown[] = []

  if (search?.trim()) {
    params.push(`%${search.trim()}%`)
    // CNIC is matched on digits only, so "35201-1234567-1" and "352011234567 1"
    // both find the same person.
    params.push(`%${search.replace(/\D/g, '')}%`)
    conditions.push(
      `(c.full_name ilike $${params.length - 1}
        or c.occupation ilike $${params.length - 1}
        or c.phone ilike $${params.length - 1}
        or ($${params.length} <> '%%' and c.cnic like $${params.length}))`,
    )
  }
  if (persona) {
    params.push(persona)
    conditions.push(`c.persona = $${params.length}`)
  }
  if (city) {
    params.push(city)
    conditions.push(`c.city = $${params.length}`)
  }
  if (thinFileOnly) {
    conditions.push('c.has_bank_loan_history = false')
  }

  const where = conditions.length ? `where ${conditions.join(' and ')}` : ''

  const totalRow = await queryOne<{ count: string }>(
    `select count(*)::text as count from customers c ${where}`,
    params,
  )

  params.push(limit, offset)
  const rows = await query<Record<string, string | null>>(
    `select
       c.id, c.full_name, c.cnic, c.phone, c.city, c.province, c.occupation,
       c.persona, c.primary_wallet, c.wallet_opened_at, c.declared_monthly_income,
       c.has_bank_loan_history,
       f.avg_monthly_inflow, f.income_volatility, f.income_regularity,
       f.bill_punctuality, f.wallet_tenure_months, f.transaction_count,
       f.activity_density, f.savings_rate, f.days_since_last_transaction,
       f.computed_at,
       s.score, s.risk_band,
       (select count(*) from applications a
         where a.customer_id = c.id and a.status in ('pending','in_review'))::text as pending_applications,
       (select count(*) from loans l
         where l.customer_id = c.id and l.status in ('active','delinquent'))::text as active_loans
     from customers c
     left join customer_features f on f.customer_id = c.id
     left join current_credit_scores s on s.customer_id = c.id
     ${where}
     order by s.score desc nulls last, c.full_name
     limit $${params.length - 1} offset $${params.length}`,
    params,
  )

  return {
    total: Number(totalRow?.count ?? 0),
    rows: rows.map(mapSummary),
  }
}

function mapSummary(r: Record<string, unknown>): CustomerSummary {
  return {
    id: r.id as string,
    fullName: r.full_name as string,
    cnic: r.cnic as string,
    phone: r.phone as string,
    city: r.city as string,
    province: r.province as string,
    occupation: r.occupation as string,
    persona: r.persona as string,
    primaryWallet: r.primary_wallet as string,
    walletOpenedAt: r.wallet_opened_at as Date,
    declaredMonthlyIncome: num(r.declared_monthly_income as string | null),
    hasBankLoanHistory: r.has_bank_loan_history as boolean,
    avgMonthlyInflow: num(r.avg_monthly_inflow as string | null),
    incomeVolatility: num(r.income_volatility as string | null),
    incomeRegularity: num(r.income_regularity as string | null),
    billPunctuality: num(r.bill_punctuality as string | null),
    walletTenureMonths: num(r.wallet_tenure_months as string | null),
    transactionCount: num(r.transaction_count as string | null),
    activityDensity: num(r.activity_density as string | null),
    savingsRate: num(r.savings_rate as string | null),
    daysSinceLastTransaction: num(r.days_since_last_transaction as string | null),
    featuresComputedAt: (r.computed_at as Date | null) ?? null,
    pendingApplications: Number(r.pending_applications ?? 0),
    activeLoans: Number(r.active_loans ?? 0),
    score: r.score === null || r.score === undefined ? null : Number(r.score),
    scoreBand: (r.risk_band as string | null) ?? null,
  }
}

export async function getCustomer(id: string): Promise<CustomerDetail | null> {
  const r = await queryOne<Record<string, unknown>>(
    `select
       c.*,
       f.avg_monthly_inflow, f.income_volatility, f.income_regularity,
       f.bill_punctuality, f.wallet_tenure_months, f.transaction_count,
       f.activity_density, f.savings_rate, f.days_since_last_transaction,
       f.computed_at,
       s.score, s.risk_band,
       (select count(*) from applications a
         where a.customer_id = c.id and a.status in ('pending','in_review'))::text as pending_applications,
       (select count(*) from loans l
         where l.customer_id = c.id and l.status in ('active','delinquent'))::text as active_loans
     from customers c
     left join customer_features f on f.customer_id = c.id
     left join current_credit_scores s on s.customer_id = c.id
     where c.id = $1`,
    [id],
  )
  if (!r) return null

  return {
    ...mapSummary(r),
    email: (r.email as string | null) ?? null,
    dateOfBirth: r.date_of_birth as Date,
    gender: r.gender as string,
    address: (r.address as string | null) ?? null,
    employmentType: r.employment_type as string,
    householdSize: r.household_size as number | null,
    dependents: r.dependents as number | null,
    educationLevel: (r.education_level as string | null) ?? null,
    bureauScore: r.bureau_score as number | null,
    deviceFingerprint: (r.device_fingerprint as string | null) ?? null,
    simRegisteredAt: (r.sim_registered_at as Date | null) ?? null,
  }
}

export async function getCustomerFeatures(customerId: string): Promise<FullFeatures | null> {
  const r = await queryOne<Record<string, unknown>>(
    'select * from customer_features where customer_id = $1',
    [customerId],
  )
  if (!r) return null

  const raw = (r.raw ?? {}) as { monthlyBuckets?: MonthlyBucket[] }

  return {
    computedAt: r.computed_at as Date,
    windowStart: r.window_start as Date,
    windowEnd: r.window_end as Date,
    observationDays: r.observation_days as number,
    totalInflow: numOr0(r.total_inflow as string),
    totalOutflow: numOr0(r.total_outflow as string),
    netFlow: numOr0(r.net_flow as string),
    avgMonthlyInflow: numOr0(r.avg_monthly_inflow as string),
    medianMonthlyInflow: numOr0(r.median_monthly_inflow as string),
    incomeVolatility: numOr0(r.income_volatility as string),
    incomeRegularity: numOr0(r.income_regularity as string),
    monthsWithIncome: r.months_with_income as number,
    incomeTrend90d: numOr0(r.income_trend_90d as string),
    largestSingleInflow: numOr0(r.largest_single_inflow as string),
    distinctIncomeSources: r.distinct_income_sources as number,
    cashOutRatio: numOr0(r.cash_out_ratio as string),
    avgMonthlyOutflow: numOr0(r.avg_monthly_outflow as string),
    savingsRate: numOr0(r.savings_rate as string),
    avgEndOfMonthBalance: numOr0(r.avg_end_of_month_balance as string),
    daysWithZeroBalance: r.days_with_zero_balance as number,
    billsTotal: r.bills_total as number,
    billsPaidOnTime: r.bills_paid_on_time as number,
    billsPaidLate: r.bills_paid_late as number,
    billsUnpaid: r.bills_unpaid as number,
    billPunctuality: numOr0(r.bill_punctuality as string),
    avgDaysLate: numOr0(r.avg_days_late as string),
    worstDaysLate: r.worst_days_late as number,
    currentMissedStreak: r.current_missed_streak as number,
    longestMissedStreak: r.longest_missed_streak as number,
    distinctBillers: r.distinct_billers as number,
    topupCount: r.topup_count as number,
    avgMonthlyTopupAmount: numOr0(r.avg_monthly_topup_amount as string),
    topupRegularity: numOr0(r.topup_regularity as string),
    daysSinceLastTopup: r.days_since_last_topup as number | null,
    walletTenureMonths: r.wallet_tenure_months as number,
    transactionCount: r.transaction_count as number,
    activeDays: r.active_days as number,
    activityDensity: numOr0(r.activity_density as string),
    daysSinceLastTransaction: r.days_since_last_transaction as number | null,
    longestDormancyDays: r.longest_dormancy_days as number,
    activeLoanCount: r.active_loan_count as number,
    totalOutstanding: numOr0(r.total_outstanding as string),
    historicalRepayments: r.historical_repayments as number,
    historicalOnTimeRate: num(r.historical_on_time_rate as string | null),
    monthlyBuckets: raw.monthlyBuckets ?? [],
  }
}

export async function getRecentTransactions(
  customerId: string,
  limit = 50,
): Promise<TransactionRow[]> {
  const rows = await query<Record<string, unknown>>(
    `select id::text, provider, direction, category, amount, balance_after,
            counterparty_name, description, occurred_at
       from wallet_transactions
      where customer_id = $1
      order by occurred_at desc
      limit $2`,
    [customerId, limit],
  )
  return rows.map((r) => ({
    id: r.id as string,
    provider: r.provider as string,
    direction: r.direction as 'in' | 'out',
    category: r.category as string,
    amount: numOr0(r.amount as string),
    balanceAfter: num(r.balance_after as string | null),
    counterpartyName: (r.counterparty_name as string | null) ?? null,
    description: (r.description as string | null) ?? null,
    occurredAt: r.occurred_at as Date,
  }))
}

export async function getBillHistory(customerId: string, limit = 36): Promise<BillRow[]> {
  const rows = await query<Record<string, unknown>>(
    `select id::text, biller_type, biller_name, billing_month, due_date,
            amount_due, paid_at, status,
            bill_days_late(due_date, paid_at) as days_late
       from bill_payments
      where customer_id = $1
      order by billing_month desc, biller_type
      limit $2`,
    [customerId, limit],
  )
  return rows.map((r) => ({
    id: r.id as string,
    billerType: r.biller_type as string,
    billerName: r.biller_name as string,
    billingMonth: r.billing_month as Date,
    dueDate: r.due_date as Date,
    amountDue: numOr0(r.amount_due as string),
    paidAt: (r.paid_at as Date | null) ?? null,
    status: r.status as BillRow['status'],
    daysLate: r.days_late as number | null,
  }))
}

export async function getTopupHistory(customerId: string, limit = 30): Promise<TopupRow[]> {
  const rows = await query<Record<string, unknown>>(
    `select id::text, network, amount, product_type, is_recurring, occurred_at
       from topups where customer_id = $1 order by occurred_at desc limit $2`,
    [customerId, limit],
  )
  return rows.map((r) => ({
    id: r.id as string,
    network: r.network as string,
    amount: numOr0(r.amount as string),
    productType: r.product_type as string,
    isRecurring: r.is_recurring as boolean,
    occurredAt: r.occurred_at as Date,
  }))
}

/**
 * Recompute a customer's monthly series straight from raw transactions.
 *
 * Used when `customer_features` has not been built yet — the profile page
 * still shows a real chart rather than an empty panel, which matters because
 * "never a blank screen" applies to stale caches too.
 */
export async function getMonthlySeriesFromRaw(
  customerId: string,
  months = 12,
): Promise<MonthlyBucket[]> {
  const rows = await query<Record<string, unknown>>(
    `select direction, category, amount, balance_after, counterparty_ref, occurred_at
       from wallet_transactions
      where customer_id = $1
        and occurred_at >= now() - ($2 || ' months')::interval
      order by occurred_at`,
    [customerId, String(months)],
  )

  const transactions = rows.map((r) => ({
    direction: r.direction as 'in' | 'out',
    category: r.category as string,
    amount: numOr0(r.amount as string),
    balanceAfter: num(r.balance_after as string | null),
    counterpartyRef: (r.counterparty_ref as string | null) ?? null,
    occurredAt: r.occurred_at as Date,
  }))

  const end = new Date()
  const start = new Date(end)
  start.setUTCMonth(start.getUTCMonth() - months)
  return bucketByMonth(transactions, start, end)
}

/** Distinct values for the list page's filter controls. */
export async function getCustomerFilterOptions(): Promise<{
  personas: string[]
  cities: string[]
}> {
  const [personas, cities] = await Promise.all([
    query<{ persona: string }>('select distinct persona from customers order by persona'),
    query<{ city: string }>('select distinct city from customers order by city'),
  ])
  return {
    personas: personas.map((r) => r.persona),
    cities: cities.map((r) => r.city),
  }
}

export interface SignalCoverage {
  customers: number
  thinFileCustomers: number
  walletTransactions: number
  billPayments: number
  topups: number
  featuresBuilt: number
  earliestSignal: Date | null
  latestSignal: Date | null
  avgMonthlyInflow: number
  avgBillPunctuality: number
  avgTenureMonths: number
}

export async function getSignalCoverage(): Promise<SignalCoverage> {
  const r = await queryOne<Record<string, unknown>>(`
    select
      (select count(*) from customers)::text                                          as customers,
      (select count(*) from customers where has_bank_loan_history = false)::text       as thin_file,
      (select count(*) from wallet_transactions)::text                                 as wallet_transactions,
      (select count(*) from bill_payments)::text                                       as bill_payments,
      (select count(*) from topups)::text                                              as topups,
      (select count(*) from customer_features)::text                                   as features_built,
      (select min(occurred_at) from wallet_transactions)                               as earliest,
      (select max(occurred_at) from wallet_transactions)                               as latest,
      (select coalesce(avg(avg_monthly_inflow), 0) from customer_features)             as avg_inflow,
      (select coalesce(avg(bill_punctuality), 0) from customer_features)               as avg_punctuality,
      (select coalesce(avg(wallet_tenure_months), 0) from customer_features)           as avg_tenure
  `)

  return {
    customers: Number(r?.customers ?? 0),
    thinFileCustomers: Number(r?.thin_file ?? 0),
    walletTransactions: Number(r?.wallet_transactions ?? 0),
    billPayments: Number(r?.bill_payments ?? 0),
    topups: Number(r?.topups ?? 0),
    featuresBuilt: Number(r?.features_built ?? 0),
    earliestSignal: (r?.earliest as Date | null) ?? null,
    latestSignal: (r?.latest as Date | null) ?? null,
    avgMonthlyInflow: numOr0(r?.avg_inflow as string),
    avgBillPunctuality: numOr0(r?.avg_punctuality as string),
    avgTenureMonths: numOr0(r?.avg_tenure as string),
  }
}
