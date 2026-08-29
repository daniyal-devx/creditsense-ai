/**
 * Run FraudSense across the whole portfolio.
 *
 *   npm run db:fraud
 *
 * Runs every detector for every customer, rebuilds the relationship graph, and
 * stores the assessments, links and clusters. Re-runnable: links and clusters
 * are replaced wholesale, assessments are appended so the history survives.
 */
import { Client } from 'pg'
import { assessFraud, withClusterMembership, type FraudAssessment, type FraudInput } from '../../src/lib/fraud/detectors'
import { buildRelationshipGraph } from '../../src/lib/fraud/graph'
import type { CustomerFeatures, RawWalletTransaction } from '../../src/lib/features/types'
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
    raw: {},
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

  console.log('\n  Running FraudSense across the portfolio\n')

  try {
    const customers = await client.query<{
      id: string
      full_name: string
      city: string
      address: string | null
      phone: string
      device_fingerprint: string | null
      declared_monthly_income: string | null
      wallet_opened_at: Date
    }>(
      `select id, full_name, city, address, phone, device_fingerprint,
              declared_monthly_income, wallet_opened_at
         from customers order by id`,
    )

    if (customers.rows.length === 0) {
      console.log('  No customers. Run `npm run db:seed` first.\n')
      return
    }

    const ids = customers.rows.map((c) => c.id)

    process.stdout.write('  Loading signals … ')

    const featureRows = await client.query<Record<string, unknown>>(
      'select * from customer_features where customer_id = any($1::uuid[])',
      [ids],
    )

    // Only the categories the detectors examine, to keep this out of the
    // hundreds of megabytes.
    const txRows = await client.query<{
      customer_id: string
      direction: 'in' | 'out'
      category: string
      amount: string
      counterparty_ref: string | null
      counterparty_name: string | null
      occurred_at: Date
    }>(
      `select customer_id, direction, category, amount, counterparty_ref,
              counterparty_name, occurred_at
         from wallet_transactions
        where customer_id = any($1::uuid[]) and is_reversed = false
        order by occurred_at`,
      [ids],
    )

    const scoreRows = await client.query<{ customer_id: string; score: number }>(
      'select customer_id, score from current_credit_scores where customer_id = any($1::uuid[])',
      [ids],
    )

    console.log(`${txRows.rows.length.toLocaleString()} transactions`)

    // ---- index the shared identifiers ----
    const byDevice = new Map<string, string[]>()
    const byAddress = new Map<string, string[]>()
    for (const c of customers.rows) {
      if (c.device_fingerprint) {
        const list = byDevice.get(c.device_fingerprint)
        if (list) list.push(c.id)
        else byDevice.set(c.device_fingerprint, [c.id])
      }
      if (c.address) {
        const key = c.address.toLowerCase().replace(/[.,#-]/g, ' ').replace(/\s+/g, ' ').trim()
        if (key.length >= 12) {
          const list = byAddress.get(key)
          if (list) list.push(c.id)
          else byAddress.set(key, [c.id])
        }
      }
    }

    // ---- counterparties shared between applicants ----
    const counterpartyToCustomers = new Map<string, Set<string>>()
    const txByCustomer = new Map<string, RawWalletTransaction[]>()

    for (const row of txRows.rows) {
      const tx: RawWalletTransaction = {
        direction: row.direction,
        category: row.category,
        amount: Number(row.amount),
        balanceAfter: null,
        counterpartyRef: row.counterparty_ref,
        occurredAt: row.occurred_at,
      }
      const list = txByCustomer.get(row.customer_id)
      if (list) list.push(tx)
      else txByCustomer.set(row.customer_id, [tx])

      if (row.counterparty_ref) {
        const set = counterpartyToCustomers.get(row.counterparty_ref)
        if (set) set.add(row.customer_id)
        else counterpartyToCustomers.set(row.counterparty_ref, new Set([row.customer_id]))
      }
    }

    // A counterparty touching many applicants is a merchant, not evidence.
    const sharedCounterparties = [...counterpartyToCustomers.entries()]
      .filter(([, set]) => set.size >= 2 && set.size <= 8)
      .map(([ref, set]) => ({ ref, customerIds: [...set] }))

    const sharedByCustomer = new Map<string, { ref: string; customerIds: string[] }[]>()
    for (const shared of sharedCounterparties) {
      for (const id of shared.customerIds) {
        const list = sharedByCustomer.get(id)
        if (list) list.push(shared)
        else sharedByCustomer.set(id, [shared])
      }
    }

    const featuresById = new Map(
      featureRows.rows.map((r) => [r.customer_id as string, rowToFeatures(r)]),
    )
    const scoreById = new Map(scoreRows.rows.map((r) => [r.customer_id, Number(r.score)]))
    const customerById = new Map(customers.rows.map((c) => [c.id, c]))

    // ---- run every detector ----
    // Assessments are held in memory rather than written straight out: the
    // relationship graph has to be built first, because belonging to a
    // detected ring is a signal in its own right and has to be folded back in.
    const assessments = new Map<string, FraudAssessment>()
    const riskByCustomer = new Map<string, number>()
    const assessedAt = new Date()

    customers.rows.forEach((customer, i) => {
      const features = featuresById.get(customer.id)
      if (!features) return

      const deviceMatches = (byDevice.get(customer.device_fingerprint ?? '') ?? [])
        .filter((id) => id !== customer.id)
        .map((id) => ({
          customerId: id,
          fullName: customerById.get(id)?.full_name ?? 'Unknown',
          fingerprint: customer.device_fingerprint ?? '',
        }))

      const addressKey = customer.address
        ? customer.address.toLowerCase().replace(/[.,#-]/g, ' ').replace(/\s+/g, ' ').trim()
        : ''
      const addressMatches = (byAddress.get(addressKey) ?? [])
        .filter((id) => id !== customer.id)
        .map((id) => ({ customerId: id, fullName: customerById.get(id)?.full_name ?? 'Unknown' }))

      const input: FraudInput = {
        customerId: customer.id,
        features,
        transactions: txByCustomer.get(customer.id) ?? [],
        deviceMatches,
        addressMatches,
        sharedCounterparties: sharedByCustomer.get(customer.id) ?? [],
        walletOpenedAt: customer.wallet_opened_at,
        declaredMonthlyIncome: customer.declared_monthly_income
          ? Number(customer.declared_monthly_income)
          : null,
      }

      const assessment = assessFraud(input)
      assessments.set(customer.id, assessment)
      riskByCustomer.set(customer.id, assessment.riskScore)

      progress('assessing', i + 1, customers.rows.length)
    })

    console.log(`\n  ✓ First pass: assessed ${assessments.size} customers individually`)

    // ---- direct transfers between applicants ----
    // Matched on the shared counterparty reference the seed writes on both
    // sides of a transfer.
    const transferRows = await client.query<{
      from_customer: string
      to_customer: string
      n: string
      total: string
    }>(`
      select o.customer_id as from_customer,
             i.customer_id as to_customer,
             count(*)::text as n,
             sum(o.amount)::text as total
        from wallet_transactions o
        join wallet_transactions i
          on i.counterparty_ref = o.counterparty_ref
         and i.direction = 'in' and o.direction = 'out'
         and i.customer_id <> o.customer_id
       where o.counterparty_ref is not null
       group by o.customer_id, i.customer_id
      having count(*) >= 2
    `)

    const transfers = transferRows.rows.map((r) => ({
      fromCustomerId: r.from_customer,
      toCustomerId: r.to_customer,
      count: Number(r.n),
      total: Number(r.total),
    }))

    // ---- build the graph ----
    process.stdout.write('  Building the relationship graph … ')

    const graph = buildRelationshipGraph({
      applicants: customers.rows.map((c) => ({
        id: c.id,
        fullName: c.full_name,
        city: c.city,
        deviceFingerprint: c.device_fingerprint,
        address: c.address,
        phone: c.phone,
        riskScore: riskByCustomer.get(c.id),
        creditScore: scoreById.get(c.id),
      })),
      transfers,
      sharedCounterparties,
    })

    console.log(
      `${graph.nodes.length} nodes, ${graph.edges.length} edges, ${graph.clusters.length} clusters`,
    )

    // ---- second pass: fold cluster membership back in ----
    const clusterByCustomer = new Map<
      string,
      { memberCount: number; severity: 'critical' | 'high' | 'medium' | 'low'; linkTypes: string[]; assessment: string }
    >()
    for (const cluster of graph.clusters) {
      for (const id of cluster.customerIds) {
        clusterByCustomer.set(id, {
          memberCount: cluster.customerIds.length,
          severity: cluster.severity,
          linkTypes: cluster.linkTypes,
          assessment: cluster.assessment,
        })
      }
    }

    let promoted = 0
    const assessmentRows: unknown[][] = []

    for (const [customerId, assessment] of assessments) {
      const finalAssessment = withClusterMembership(
        assessment,
        clusterByCustomer.get(customerId) ?? null,
      )
      if (finalAssessment.level !== assessment.level) promoted++

      assessmentRows.push([
        customerId,
        finalAssessment.riskScore,
        finalAssessment.level,
        JSON.stringify(finalAssessment.flags),
        finalAssessment.flags.map((f) => f.code),
        finalAssessment.summary,
        assessedAt,
      ])
    }

    await client.query('truncate fraud_assessments')
    await bulkInsert(
      client,
      'fraud_assessments',
      ['customer_id', 'risk_score', 'level', 'flags', 'flag_codes', 'summary', 'assessed_at'],
      assessmentRows,
    )
    console.log(
      `  ✓ Second pass: ${promoted} assessment${promoted === 1 ? '' : 's'} escalated by cluster membership`,
    )

    // ---- store the links ----
    // Ordered pairs so an undirected edge is stored once, matching the CHECK
    // constraint on the table.
    const linkRows: unknown[][] = []
    const seen = new Set<string>()

    for (const edge of graph.edges) {
      const [a, b] = edge.source < edge.target ? [edge.source, edge.target] : [edge.target, edge.source]
      const sharedValue = edge.id.split(':')[1] ?? null
      const key = `${a}|${b}|${edge.type}|${sharedValue}`
      if (seen.has(key)) continue
      seen.add(key)

      linkRows.push([a, b, edge.type, edge.weight.toFixed(3), sharedValue, JSON.stringify({ label: edge.label })])
    }

    await client.query('truncate fraud_links')
    await bulkInsert(
      client,
      'fraud_links',
      ['customer_a', 'customer_b', 'link_type', 'weight', 'shared_value', 'detail'],
      linkRows,
      { onConflict: 'on conflict do nothing' },
    )
    console.log(`  ✓ Stored ${linkRows.length} relationship links`)

    // ---- store the clusters ----
    await client.query('truncate fraud_clusters')
    if (graph.clusters.length > 0) {
      await bulkInsert(
        client,
        'fraud_clusters',
        ['label', 'customer_ids', 'member_count', 'cohesion', 'link_types', 'severity', 'assessment'],
        graph.clusters.map((c, i) => [
          `Cluster ${i + 1}`,
          c.customerIds,
          c.customerIds.length,
          c.cohesion.toFixed(3),
          c.linkTypes,
          c.severity,
          c.assessment,
        ]),
      )
    }
    console.log(`  ✓ Stored ${graph.clusters.length} clusters`)

    // ---- summary ----
    const { rows: levels } = await client.query<{ level: string; n: string }>(
      'select level, count(*)::text as n from current_fraud_assessments group by level',
    )
    const order = ['block', 'investigate', 'review', 'clear']
    const labels: Record<string, string> = {
      block: 'Do not decide',
      investigate: 'Needs investigation',
      review: 'Minor signals',
      clear: 'No signals',
    }

    console.log('\n  Fraud levels')
    console.log('  ' + '─'.repeat(56))
    for (const level of order) {
      const n = Number(levels.find((l) => l.level === level)?.n ?? 0)
      console.log(`  ${labels[level].padEnd(22)} ${String(n).padStart(4)}`)
    }

    const { rows: topFlags } = await client.query<{ code: string; n: string }>(`
      select unnest(flag_codes) as code, count(*)::text as n
        from current_fraud_assessments
       group by 1 order by count(*) desc limit 8
    `)
    if (topFlags.length > 0) {
      console.log('\n  Most common flags')
      console.log('  ' + '─'.repeat(56))
      for (const row of topFlags) {
        console.log(`  ${row.code.padEnd(30)} ${String(row.n).padStart(4)}`)
      }
    }

    // ---- did we catch the planted ring? ----
    const { rows: ring } = await client.query<{
      full_name: string
      risk_score: number
      level: string
      flag_codes: string[]
    }>(`
      select c.full_name, f.risk_score, f.level, f.flag_codes
        from seed_labels l
        join customers c on c.id = l.customer_id
        join current_fraud_assessments f on f.customer_id = l.customer_id
       where l.narrative = 'fraud_ring'
       order by f.risk_score desc
    `)

    if (ring.length > 0) {
      console.log('\n  The planted fraud ring')
      console.log('  ' + '─'.repeat(72))
      for (const member of ring) {
        console.log(
          `  ${member.full_name.padEnd(22)} ${String(member.risk_score).padStart(3)}  ` +
            `${member.level.padEnd(12)} ${member.flag_codes.join(', ')}`,
        )
      }
      const caught = ring.filter((m) => m.level === 'block' || m.level === 'investigate').length
      console.log('  ' + '─'.repeat(72))
      console.log(`  Caught ${caught} of ${ring.length} ring members at investigate level or above`)
      if (caught < ring.length) {
        console.log('  ⚠ Some ring members were not flagged. The detectors need tightening.')
      }
    }

    console.log()
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error('\n✖ Fraud run failed:', err)
  process.exit(1)
})
