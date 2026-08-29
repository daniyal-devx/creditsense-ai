/**
 * Score every customer and store the result.
 *
 *   npm run db:score
 *   npm run db:score -- --trigger batch
 *
 * Reads the engineered features, runs the committed scorecard, and appends a
 * row to `credit_scores`. Append-only: previous scores are never overwritten,
 * because the history is what makes a past decision defensible and what
 * Phase 6 watches for deterioration.
 */
import { Client } from 'pg'
import { scoreCustomer } from '../../src/lib/scoring/score'
import type { CustomerFeatures } from '../../src/lib/features/types'
import { bulkInsert, progress } from './lib/bulk'
import { loadEnv, migrationConnectionString } from './env'

/**
 * Rebuild a CustomerFeatures object from a `customer_features` row.
 *
 * pg returns `numeric` as a string so no precision is lost in transit; every
 * one has to be converted here rather than leaving `"0.84"` to be silently
 * coerced somewhere inside the scorecard.
 */
function rowToFeatures(r: Record<string, unknown>): CustomerFeatures {
  const n = (v: unknown): number => Number(v ?? 0)
  const raw = (r.raw ?? {}) as Record<string, unknown>

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
    raw,
  }
}

async function main() {
  loadEnv()

  const triggerArg = process.argv.includes('--trigger')
    ? process.argv[process.argv.indexOf('--trigger') + 1]
    : 'batch'

  const client = new Client({
    connectionString: migrationConnectionString(),
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 20_000,
  })
  await client.connect()

  console.log('\n  Scoring every customer\n')

  try {
    const { rows } = await client.query<Record<string, unknown>>(
      'select * from customer_features order by customer_id',
    )

    if (rows.length === 0) {
      console.log('  No feature snapshots found. Run `npm run db:features` first.\n')
      return
    }

    const asOf = new Date()
    const scoreRows: unknown[][] = []
    const scores: number[] = []

    rows.forEach((row, i) => {
      const features = rowToFeatures(row)
      const result = scoreCustomer(features, asOf)
      scores.push(result.score)

      scoreRows.push([
        row.customer_id,
        result.score,
        result.band.id,
        result.probabilityOfDefault.toFixed(6),
        result.modelVersion,
        result.modelTrainedAt,
        JSON.stringify(result.contributions),
        // The feature values the score came from, so it can be recomputed and
        // verified later without replaying the raw transaction history.
        JSON.stringify({
          ...features,
          // The monthly buckets are large and already live in customer_features.
          raw: undefined,
        }),
        triggerArg,
        asOf,
      ])

      progress('scoring', i + 1, rows.length)
    })

    await bulkInsert(
      client,
      'credit_scores',
      [
        'customer_id', 'score', 'risk_band', 'probability_of_default',
        'model_version', 'model_trained_at', 'contributions', 'feature_snapshot',
        'trigger', 'scored_at',
      ],
      scoreRows,
    )

    console.log(`\n  ✓ Scored ${scoreRows.length} customers`)

    // ---- distribution ----
    const { rows: distribution } = await client.query<{
      risk_band: string
      customers: string
      avg_score: string
      min_score: number
      max_score: number
    }>('select * from score_distribution')

    const order = ['very-low', 'low', 'moderate', 'high', 'very-high']
    const labels: Record<string, string> = {
      'very-low': 'Very Low Risk',
      low: 'Low Risk',
      moderate: 'Moderate Risk',
      high: 'High Risk',
      'very-high': 'Very High Risk',
    }

    console.log('\n  Score distribution')
    console.log('  ' + '─'.repeat(62))
    const total = scoreRows.length
    for (const band of order) {
      const row = distribution.find((d) => d.risk_band === band)
      const count = Number(row?.customers ?? 0)
      const pct = (count / total) * 100
      const bar = '█'.repeat(Math.round(pct / 2.5))
      console.log(
        `  ${labels[band].padEnd(15)} ${String(count).padStart(4)}  ${pct.toFixed(1).padStart(5)}%  ${bar}`,
      )
    }

    const sorted = [...scores].sort((a, b) => a - b)
    const percentile = (p: number) => sorted[Math.floor((sorted.length - 1) * p)]
    console.log('  ' + '─'.repeat(62))
    console.log(
      `  min ${sorted[0]}   p25 ${percentile(0.25)}   median ${percentile(0.5)}   ` +
        `p75 ${percentile(0.75)}   max ${sorted[sorted.length - 1]}`,
    )

    // ---- does the score actually separate the labels? ----
    // The distribution can look perfectly reasonable while the model ranks
    // nobody correctly, so check it against the ground truth explicitly.
    const { rows: separation } = await client.query<{
      will_default: boolean
      n: string
      avg_score: string
    }>(`
      select l.will_default, count(*)::text as n, round(avg(s.score))::text as avg_score
        from current_credit_scores s
        join seed_labels l on l.customer_id = s.customer_id
       group by l.will_default
       order by l.will_default
    `)

    console.log('\n  Separation against ground truth')
    console.log('  ' + '─'.repeat(62))
    for (const row of separation) {
      console.log(
        `  ${row.will_default ? 'Defaulted    ' : 'Did not default'} ` +
          `n=${String(row.n).padStart(4)}   average score ${row.avg_score}`,
      )
    }

    const good = separation.find((r) => !r.will_default)
    const bad = separation.find((r) => r.will_default)
    if (good && bad) {
      const gap = Number(good.avg_score) - Number(bad.avg_score)
      console.log(`  ${'─'.repeat(62)}`)
      console.log(`  Gap: ${gap} points in favour of the non-defaulters`)
      if (gap < 40) {
        console.log('\n  ⚠ That gap is small. The score is barely separating the two groups.')
      }
    }

    // ---- the planted narratives ----
    const { rows: narratives } = await client.query<{
      narrative: string
      full_name: string
      score: number
      risk_band: string
    }>(`
      select l.narrative, c.full_name, s.score, s.risk_band
        from seed_labels l
        join customers c on c.id = l.customer_id
        join current_credit_scores s on s.customer_id = l.customer_id
       where l.narrative is not null
       order by l.narrative, s.score desc
    `)

    if (narratives.length > 0) {
      console.log('\n  Demo narratives')
      console.log('  ' + '─'.repeat(62))
      for (const row of narratives) {
        console.log(
          `  ${row.narrative.padEnd(16)} ${row.full_name.padEnd(22)} ` +
            `${String(row.score).padStart(4)}  ${labels[row.risk_band]}`,
        )
      }
    }

    console.log()
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error('\n✖ Scoring failed:', err)
  process.exit(1)
})
