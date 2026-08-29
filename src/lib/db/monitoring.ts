import 'server-only'
import { query, queryOne } from './client'
import { getRiskBand, type RiskBand } from '@/lib/risk'
import type { AlertSeverity, AlertType } from '@/lib/monitoring/early-warning'

/** Reads for the monitoring and portfolio surfaces. */

export interface AlertRow {
  alertId: string
  customerId: string
  fullName: string
  city: string
  phone: string
  alertType: AlertType
  severity: AlertSeverity
  title: string
  detail: string
  recommendedAction: string
  evidence: Record<string, unknown>
  scoreAtAlert: number | null
  scoreChange: number | null
  status: string
  raisedAt: Date
  loanId: string | null
  loanReference: string | null
  outstandingBalance: number | null
  loanStatus: string | null
  currentScore: number | null
  currentBand: RiskBand | null
}

function mapAlert(r: Record<string, unknown>): AlertRow {
  const currentScore = r.current_score === null ? null : Number(r.current_score)
  return {
    alertId: r.alert_id as string,
    customerId: r.customer_id as string,
    fullName: r.full_name as string,
    city: r.city as string,
    phone: r.phone as string,
    alertType: r.alert_type as AlertType,
    severity: r.severity as AlertSeverity,
    title: r.title as string,
    detail: r.detail as string,
    recommendedAction: r.recommended_action as string,
    evidence: (r.evidence as Record<string, unknown>) ?? {},
    scoreAtAlert: r.score_at_alert === null ? null : Number(r.score_at_alert),
    scoreChange: r.score_change === null ? null : Number(r.score_change),
    status: r.status as string,
    raisedAt: r.raised_at as Date,
    loanId: (r.loan_id as string | null) ?? null,
    loanReference: (r.loan_reference as string | null) ?? null,
    outstandingBalance:
      r.outstanding_balance === null ? null : Number(r.outstanding_balance),
    loanStatus: (r.loan_status as string | null) ?? null,
    currentScore,
    currentBand: currentScore === null ? null : getRiskBand(currentScore),
  }
}

/** The early-warning feed: open alerts, most urgent first. */
export async function getEarlyWarningFeed(limit = 100): Promise<AlertRow[]> {
  const rows = await query<Record<string, unknown>>(
    'select * from early_warning_feed limit $1',
    [limit],
  )
  return rows.map(mapAlert)
}

export async function getAlertsForCustomer(customerId: string): Promise<AlertRow[]> {
  const rows = await query<Record<string, unknown>>(
    'select * from early_warning_feed where customer_id = $1',
    [customerId],
  )
  return rows.map(mapAlert)
}

export interface PortfolioHealth {
  totalCustomers: number
  scoredCustomers: number
  averageScore: number
  activeLoans: number
  totalOutstanding: number
  delinquentLoans: number
  defaultedLoans: number
  openAlerts: number
  criticalAlerts: number
  recentDowngrades: number
}

export async function getPortfolioHealth(): Promise<PortfolioHealth> {
  const r = await queryOne<Record<string, unknown>>('select * from portfolio_health')
  const n = (v: unknown) => Number(v ?? 0)
  return {
    totalCustomers: n(r?.total_customers),
    scoredCustomers: n(r?.scored_customers),
    averageScore: n(r?.average_score),
    activeLoans: n(r?.active_loans),
    totalOutstanding: n(r?.total_outstanding),
    delinquentLoans: n(r?.delinquent_loans),
    defaultedLoans: n(r?.defaulted_loans),
    openAlerts: n(r?.open_alerts),
    criticalAlerts: n(r?.critical_alerts),
    recentDowngrades: n(r?.recent_downgrades),
  }
}

export interface SnapshotRow {
  date: string
  averageScore: number
  medianScore: number
  bands: { veryLow: number; low: number; moderate: number; high: number; veryHigh: number }
  activeLoans: number
  totalOutstanding: number
  delinquentLoans: number
  openAlerts: number
}

/** The trend series. Oldest first, as a chart reads. */
export async function getPortfolioTrend(days = 60): Promise<SnapshotRow[]> {
  const rows = await query<Record<string, unknown>>(
    `select * from portfolio_snapshots
      where snapshot_date >= current_date - ($1 || ' days')::interval
      order by snapshot_date`,
    [String(days)],
  )

  return rows.map((r) => ({
    date: (r.snapshot_date as Date).toISOString().slice(0, 10),
    averageScore: Number(r.average_score),
    medianScore: Number(r.median_score),
    bands: {
      veryLow: Number(r.band_very_low),
      low: Number(r.band_low),
      moderate: Number(r.band_moderate),
      high: Number(r.band_high),
      veryHigh: Number(r.band_very_high),
    },
    activeLoans: Number(r.active_loans),
    totalOutstanding: Number(r.total_outstanding),
    delinquentLoans: Number(r.delinquent_loans),
    openAlerts: Number(r.open_alerts),
  }))
}

export interface MigrationRow {
  customerId: string
  fullName: string
  fromBand: RiskBand
  toBand: RiskBand
  fromScore: number
  toScore: number
  scoreChange: number
  migratedAt: Date
}

/**
 * Who moved between bands.
 *
 * Downgrades first: "who is getting worse" is the question this answers, and
 * an upgrade is never the reason someone opens this page in a hurry.
 */
export async function getRiskMigrations(limit = 50): Promise<MigrationRow[]> {
  const rows = await query<Record<string, unknown>>(
    `select m.*, c.full_name
       from risk_migrations m
       join customers c on c.id = m.customer_id
      order by (m.score_change < 0) desc, m.migrated_at desc, m.score_change
      limit $1`,
    [limit],
  )

  return rows.map((r) => ({
    customerId: r.customer_id as string,
    fullName: r.full_name as string,
    fromBand: getRiskBand(Number(r.from_score)),
    toBand: getRiskBand(Number(r.to_score)),
    fromScore: Number(r.from_score),
    toScore: Number(r.to_score),
    scoreChange: Number(r.score_change),
    migratedAt: r.migrated_at as Date,
  }))
}

export interface PersonaBreakdown {
  persona: string
  customers: number
  averageScore: number
  averageIncome: number
  defaultRate: number
}

/** Risk by persona — does the model treat a driver differently from a freelancer? */
export async function getPersonaBreakdown(): Promise<PersonaBreakdown[]> {
  const rows = await query<Record<string, unknown>>(`
    select
      c.persona,
      count(*)::text                                          as customers,
      round(avg(s.score))::text                               as average_score,
      round(avg(f.avg_monthly_inflow))::text                  as average_income,
      round(avg(s.probability_of_default), 4)::text           as default_rate
    from customers c
    join current_credit_scores s on s.customer_id = c.id
    left join customer_features f on f.customer_id = c.id
    group by c.persona
    order by avg(s.score) desc
  `)

  return rows.map((r) => ({
    persona: r.persona as string,
    customers: Number(r.customers),
    averageScore: Number(r.average_score),
    averageIncome: Number(r.average_income),
    defaultRate: Number(r.default_rate),
  }))
}

export interface AlertTypeBreakdown {
  alertType: AlertType
  count: number
  criticalCount: number
}

export async function getAlertBreakdown(): Promise<AlertTypeBreakdown[]> {
  const rows = await query<{ alert_type: string; n: string; critical: string }>(
    `select alert_type,
            count(*)::text as n,
            count(*) filter (where severity = 'critical')::text as critical
       from monitoring_alerts
      where status = 'open'
      group by alert_type
      order by count(*) desc`,
  )

  return rows.map((r) => ({
    alertType: r.alert_type as AlertType,
    count: Number(r.n),
    criticalCount: Number(r.critical),
  }))
}

/** Acknowledge an alert — records who and when, and takes it out of the feed. */
export async function acknowledgeAlert(
  alertId: string,
  userId: string,
  note?: string,
): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `update monitoring_alerts
        set status = 'acknowledged',
            acknowledged_at = now(),
            acknowledged_by = $2,
            resolution_note = $3
      where id = $1 and status = 'open'
      returning id`,
    [alertId, userId, note ?? null],
  )
  return rows.length > 0
}
