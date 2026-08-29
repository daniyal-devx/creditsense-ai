/**
 * The continuous monitoring run.
 *
 *   npm run db:monitor
 *
 * Re-scores every customer with a live loan, compares against their previous
 * score, raises early-warning alerts, records band migrations, and writes a
 * portfolio snapshot.
 *
 * Intended to run on a schedule. In production this would be a cron job hitting
 * /api/monitoring/run; here it is a script so the whole loop can be watched.
 */
import { Client } from 'pg'
import { detectEarlyWarnings, type MonitoringInput } from '../../src/lib/monitoring/early-warning'
import { scoreCustomer } from '../../src/lib/scoring/score'
import { getRiskBand } from '../../src/lib/risk'
import type { CustomerFeatures } from '../../src/lib/features/types'
import { bulkInsert, progress } from './lib/bulk'
import { loadEnv, migrationConnectionString } from './env'

function rowToFeatures(r: Record<string, unknown>): CustomerFeatures {
  const n = (v: unknown): number => Number(v ?? 0)
  return {
    computedAt: r.computed_at as Date,
    windowStart: r.window_start as Date,
    windowEnd: r.window_end as Date,
    observationDays: n(r.observation_days),
    totalInflow: n(r.total_inflow),
    totalOutflow: n(r.total_outflow),
    netFlow: n(r.net_flow),
    avgMonthlyInflow: n(r.avg_monthly_inflow),
    medianMonthlyInflow: n(r.median_monthly_inflow),
    incomeVolatility: n(r.income_volatility),
    incomeRegularity: n(r.income_regularity),
    monthsWithIncome: n(r.months_with_income),
    incomeTrend90d: n(r.income_trend_90d),
    largestSingleInflow: n(r.largest_single_inflow),
    distinctIncomeSources: n(r.distinct_income_sources),
    cashOutRatio: n(r.cash_out_ratio),
    avgMonthlyOutflow: n(r.avg_monthly_outflow),
    savingsRate: n(r.savings_rate),
    avgEndOfMonthBalance: n(r.avg_end_of_month_balance),
    daysWithZeroBalance: n(r.days_with_zero_balance),
    billsTotal: n(r.bills_total),
    billsPaidOnTime: n(r.bills_paid_on_time),
    billsPaidLate: n(r.bills_paid_late),
    billsUnpaid: n(r.bills_unpaid),
    billPunctuality: n(r.bill_punctuality),
    avgDaysLate: n(r.avg_days_late),
    worstDaysLate: n(r.worst_days_late),
    currentMissedStreak: n(r.current_missed_streak),
    longestMissedStreak: n(r.longest_missed_streak),
    distinctBillers: n(r.distinct_billers),
    topupCount: n(r.topup_count),
    avgMonthlyTopupAmount: n(r.avg_monthly_topup_amount),
    topupRegularity: n(r.topup_regularity),
    daysSinceLastTopup: r.days_since_last_topup === null ? null : n(r.days_since_last_topup),
    walletTenureMonths: n(r.wallet_tenure_months),
    transactionCount: n(r.transaction_count),
    activeDays: n(r.active_days),
    activityDensity: n(r.activity_density),
    daysSinceLastTransaction:
      r.days_since_last_transaction === null ? null : n(r.days_since_last_transaction),
    longestDormancyDays: n(r.longest_dormancy_days),
    activeLoanCount: n(r.active_loan_count),
    totalOutstanding: n(r.total_outstanding),
    historicalRepayments: n(r.historical_repayments),
    historicalOnTimeRate:
      r.historical_on_time_rate === null ? null : n(r.historical_on_time_rate),
    raw: (r.raw ?? {}) as Record<string, unknown>,
  }
}

async function main() {
  loadEnv()

  const client = new Client({
    connectionString: migrationConnectionString(),
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 20_000,
  })
  await client.connect()

  console.log('\n  Continuous monitoring run\n  ' + '─'.repeat(60))

  try {
    // Everyone with a live loan, plus anyone whose score is stale. A customer
    // with no exposure and no application is not worth re-scoring on a cycle.
    const { rows: subjects } = await client.query<{
      customer_id: string
      full_name: string
      loan_id: string | null
      loan_reference: string | null
      outstanding_balance: string | null
      instalment_amount: string | null
      loan_status: string | null
      missed_instalments: string
      next_due_date: Date | null
    }>(`
      select
        c.id as customer_id,
        c.full_name,
        l.id as loan_id,
        l.reference as loan_reference,
        l.outstanding_balance,
        l.instalment_amount,
        l.status as loan_status,
        coalesce((select count(*) from repayments r
                   where r.loan_id = l.id and r.status = 'missed'), 0)::text as missed_instalments,
        (select min(r.due_date) from repayments r
          where r.loan_id = l.id and r.status = 'due') as next_due_date
      from customers c
      left join loans l on l.customer_id = c.id and l.status in ('active', 'delinquent')
      where l.id is not null
         or exists (select 1 from applications a
                     where a.customer_id = c.id and a.status in ('pending', 'in_review'))
      order by c.id
    `)

    if (subjects.length === 0) {
      console.log('  Nobody to monitor — no live loans or open applications.\n')
      return
    }

    console.log(`  Monitoring ${subjects.length} customers with live exposure\n`)

    const customerIds = [...new Set(subjects.map((s) => s.customer_id))]

    const { rows: featureRows } = await client.query<Record<string, unknown>>(
      'select * from customer_features where customer_id = any($1::uuid[])',
      [customerIds],
    )
    const featuresById = new Map(
      featureRows.map((r) => [r.customer_id as string, rowToFeatures(r)]),
    )

    // The most recent stored score per customer — the baseline the new one is
    // compared against.
    const { rows: previousRows } = await client.query<{
      customer_id: string
      score: number
      scored_at: Date
    }>(
      `select distinct on (customer_id) customer_id, score, scored_at
         from credit_scores
        where customer_id = any($1::uuid[])
        order by customer_id, scored_at desc`,
      [customerIds],
    )
    const previousById = new Map(previousRows.map((r) => [r.customer_id, r]))

    const now = new Date()
    const newScoreRows: unknown[][] = []
    const alertRows: unknown[][] = []
    const migrationRows: unknown[][] = []

    let alertCount = 0
    let migrationCount = 0

    subjects.forEach((subject, i) => {
      const features = featuresById.get(subject.customer_id)
      if (!features) return

      const scored = scoreCustomer(features, now)
      const previous = previousById.get(subject.customer_id)

      newScoreRows.push([
        subject.customer_id,
        scored.score,
        scored.band.id,
        scored.probabilityOfDefault.toFixed(6),
        scored.modelVersion,
        scored.modelTrainedAt,
        JSON.stringify(scored.contributions),
        JSON.stringify({ ...features, raw: undefined }),
        'monitoring',
        now,
      ])

      // ---- band migration ----
      if (previous) {
        const fromBand = getRiskBand(previous.score)
        const toBand = scored.band
        if (fromBand.id !== toBand.id) {
          migrationRows.push([
            subject.customer_id,
            fromBand.id,
            toBand.id,
            previous.score,
            scored.score,
            scored.score - previous.score,
            now,
          ])
          migrationCount++
        }
      }

      // ---- early warnings ----
      const daysSincePrevious = previous
        ? Math.round((now.getTime() - previous.scored_at.getTime()) / 86_400_000)
        : null

      const input: MonitoringInput = {
        customerId: subject.customer_id,
        customerName: subject.full_name,
        features,
        currentScore: scored.score,
        previousScore: previous?.score ?? null,
        daysSincePreviousScore: daysSincePrevious,
        loan: subject.loan_id
          ? {
              id: subject.loan_id,
              reference: subject.loan_reference ?? '',
              outstandingBalance: Number(subject.outstanding_balance ?? 0),
              instalmentAmount: Number(subject.instalment_amount ?? 0),
              status: subject.loan_status ?? 'active',
              missedInstalments: Number(subject.missed_instalments ?? 0),
              nextDueDate: subject.next_due_date,
            }
          : null,
      }

      for (const alert of detectEarlyWarnings(input)) {
        alertRows.push([
          subject.customer_id,
          subject.loan_id,
          alert.type,
          alert.severity,
          alert.title,
          alert.detail,
          alert.recommendedAction,
          JSON.stringify(alert.evidence),
          alert.scoreAtAlert ?? scored.score,
          alert.scoreChange ?? null,
          now,
        ])
        alertCount++
      }

      progress('monitoring', i + 1, subjects.length)
    })

    // ---- write ----
    await bulkInsert(
      client,
      'credit_scores',
      ['customer_id', 'score', 'risk_band', 'probability_of_default', 'model_version',
       'model_trained_at', 'contributions', 'feature_snapshot', 'trigger', 'scored_at'],
      newScoreRows,
    )
    console.log(`\n  ✓ Re-scored ${newScoreRows.length} customers`)

    // Alerts are replaced rather than appended: an open alert that is still
    // true would otherwise be raised again on every run, and a feed with the
    // same warning fifty times is a feed nobody reads. Acknowledged and
    // resolved alerts are kept — that is the audit trail of what was acted on.
    await client.query(`delete from monitoring_alerts where status = 'open'`)

    if (alertRows.length > 0) {
      await bulkInsert(
        client,
        'monitoring_alerts',
        ['customer_id', 'loan_id', 'alert_type', 'severity', 'title', 'detail',
         'recommended_action', 'evidence', 'score_at_alert', 'score_change', 'raised_at'],
        alertRows,
      )
    }
    console.log(`  ✓ Raised ${alertCount} early-warning alerts`)

    if (migrationRows.length > 0) {
      await bulkInsert(
        client,
        'risk_migrations',
        ['customer_id', 'from_band', 'to_band', 'from_score', 'to_score', 'score_change', 'migrated_at'],
        migrationRows,
      )
    }
    console.log(`  ✓ Recorded ${migrationCount} band migrations`)

    // ---- portfolio snapshot ----
    await client.query(`
      insert into portfolio_snapshots (
        snapshot_date, total_customers, scored_customers, average_score, median_score,
        band_very_low, band_low, band_moderate, band_high, band_very_high,
        active_loans, total_outstanding, delinquent_loans, defaulted_loans,
        open_alerts, critical_alerts
      )
      select
        current_date,
        (select count(*) from customers),
        (select count(*) from current_credit_scores),
        (select coalesce(round(avg(score), 1), 0) from current_credit_scores),
        (select coalesce(percentile_cont(0.5) within group (order by score), 0)::int
           from current_credit_scores),
        (select count(*) from current_credit_scores where risk_band = 'very-low'),
        (select count(*) from current_credit_scores where risk_band = 'low'),
        (select count(*) from current_credit_scores where risk_band = 'moderate'),
        (select count(*) from current_credit_scores where risk_band = 'high'),
        (select count(*) from current_credit_scores where risk_band = 'very-high'),
        (select count(*) from loans where status in ('active','delinquent')),
        (select coalesce(sum(outstanding_balance),0) from loans where status in ('active','delinquent')),
        (select count(*) from loans where status = 'delinquent'),
        (select count(*) from loans where status in ('defaulted','written_off')),
        (select count(*) from monitoring_alerts where status = 'open'),
        (select count(*) from monitoring_alerts where status = 'open' and severity = 'critical')
      on conflict (snapshot_date) do update set
        total_customers   = excluded.total_customers,
        scored_customers  = excluded.scored_customers,
        average_score     = excluded.average_score,
        median_score      = excluded.median_score,
        band_very_low     = excluded.band_very_low,
        band_low          = excluded.band_low,
        band_moderate     = excluded.band_moderate,
        band_high         = excluded.band_high,
        band_very_high    = excluded.band_very_high,
        active_loans      = excluded.active_loans,
        total_outstanding = excluded.total_outstanding,
        delinquent_loans  = excluded.delinquent_loans,
        defaulted_loans   = excluded.defaulted_loans,
        open_alerts       = excluded.open_alerts,
        critical_alerts   = excluded.critical_alerts
    `)
    console.log('  ✓ Wrote today\'s portfolio snapshot')

    // ---- summary ----
    const { rows: bySeverity } = await client.query<{ severity: string; n: string }>(
      `select severity, count(*)::text as n from monitoring_alerts
        where status = 'open' group by severity`,
    )
    console.log('\n  Open alerts by severity')
    console.log('  ' + '─'.repeat(60))
    for (const severity of ['critical', 'high', 'medium', 'low']) {
      const n = Number(bySeverity.find((s) => s.severity === severity)?.n ?? 0)
      console.log(`  ${severity.padEnd(12)} ${String(n).padStart(4)}`)
    }

    const { rows: byType } = await client.query<{ alert_type: string; n: string }>(
      `select alert_type, count(*)::text as n from monitoring_alerts
        where status = 'open' group by alert_type order by count(*) desc`,
    )
    if (byType.length > 0) {
      console.log('\n  Open alerts by type')
      console.log('  ' + '─'.repeat(60))
      for (const row of byType) {
        console.log(`  ${row.alert_type.padEnd(24)} ${String(row.n).padStart(4)}`)
      }
    }

    // ---- did we catch the planted deterioration case? ----
    const { rows: narrative } = await client.query<{
      full_name: string
      alert_type: string
      severity: string
      title: string
    }>(`
      select c.full_name, a.alert_type, a.severity, a.title
        from seed_labels l
        join customers c on c.id = l.customer_id
        join monitoring_alerts a on a.customer_id = l.customer_id
       where l.narrative = 'deterioration' and a.status = 'open'
       order by case a.severity when 'critical' then 0 when 'high' then 1 else 2 end
    `)

    console.log('\n  The planted deterioration case')
    console.log('  ' + '─'.repeat(60))
    if (narrative.length === 0) {
      console.log('  ⚠ No alerts raised. The detectors missed it.')
    } else {
      for (const row of narrative) {
        console.log(`  ${row.severity.padEnd(9)} ${row.title}`)
      }
      console.log(`\n  Caught with ${narrative.length} alert${narrative.length === 1 ? '' : 's'}.`)
    }

    console.log()
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error('\n✖ Monitoring run failed:', err)
  process.exit(1)
})
