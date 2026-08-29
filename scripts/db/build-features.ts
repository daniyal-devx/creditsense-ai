/**
 * Build the engineered feature snapshot for every customer.
 *
 *   npm run db:features
 *   npm run db:features -- --customer <uuid>
 *
 * Reads the raw signals, runs them through the same `computeFeatures` the app
 * uses, and upserts the result into `customer_features`. Re-runnable: it
 * replaces whatever was there, so it can be run after new signals arrive
 * (which is exactly what Phase 6's monitoring loop will do).
 */
import { Client } from 'pg'
import { FEATURE_COLUMNS, computeFeatures, featuresToRow } from '../../src/lib/features/compute'
import type { SignalBundle } from '../../src/lib/features/types'
import { bulkInsert, progress } from './lib/bulk'
import { loadEnv, migrationConnectionString } from './env'

interface CustomerRow {
  id: string
  full_name: string
  wallet_opened_at: Date
}

async function main() {
  loadEnv()

  const customerFilter = process.argv.includes('--customer')
    ? process.argv[process.argv.indexOf('--customer') + 1]
    : null

  const client = new Client({
    connectionString: migrationConnectionString(),
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 20_000,
  })
  await client.connect()

  console.log('\n  Building engineered features\n')

  try {
    const { rows: customers } = await client.query<CustomerRow>(
      customerFilter
        ? 'select id, full_name, wallet_opened_at from customers where id = $1'
        : 'select id, full_name, wallet_opened_at from customers order by created_at',
      customerFilter ? [customerFilter] : [],
    )

    if (customers.length === 0) {
      console.log('  No customers found. Run `npm run db:seed` first.\n')
      return
    }

    // One query per table for the whole population, then grouped in memory.
    // 69 customers x 5 tables would otherwise be 345 round trips to Tokyo.
    const ids = customers.map((c) => c.id)

    process.stdout.write('  Loading raw signals … ')

    // Sequential, not Promise.all: a single pg Client multiplexes one connection,
    // so concurrent queries on it are serialised anyway and emit a deprecation
    // warning for the trouble.
    const txRes = await client.query<{
      customer_id: string
      direction: 'in' | 'out'
      category: string
      amount: string
      balance_after: string | null
      counterparty_ref: string | null
      occurred_at: Date
    }>(
      `select customer_id, direction, category, amount, balance_after, counterparty_ref, occurred_at
         from wallet_transactions
        where customer_id = any($1::uuid[]) and is_reversed = false
        order by occurred_at`,
      [ids],
    )

    const billRes = await client.query<{
      customer_id: string
      biller_type: string
      biller_name: string
      billing_month: Date
      due_date: Date
      amount_due: string
      paid_at: Date | null
      status: 'paid_on_time' | 'paid_late' | 'unpaid'
    }>(
      `select customer_id, biller_type, biller_name, billing_month, due_date,
              amount_due, paid_at, status
         from bill_payments
        where customer_id = any($1::uuid[])
        order by billing_month`,
      [ids],
    )

    const topupRes = await client.query<{
      customer_id: string
      amount: string
      is_recurring: boolean
      occurred_at: Date
    }>(
      `select customer_id, amount, is_recurring, occurred_at
         from topups where customer_id = any($1::uuid[]) order by occurred_at`,
      [ids],
    )

    const loanRes = await client.query<{
      customer_id: string
      status: string
      outstanding_balance: string
    }>(
      `select customer_id, status, outstanding_balance
         from loans where customer_id = any($1::uuid[])`,
      [ids],
    )

    const repayRes = await client.query<{
      customer_id: string
      status: string
      days_late: number | null
    }>(
      `select customer_id, status, days_late
         from repayments where customer_id = any($1::uuid[])`,
      [ids],
    )

    console.log(
      `${txRes.rows.length.toLocaleString()} transactions, ` +
        `${billRes.rows.length.toLocaleString()} bills, ` +
        `${topupRes.rows.length.toLocaleString()} top-ups`,
    )

    // `numeric` comes back from pg as a string, deliberately — it does not fit
    // in a JS float without loss. Every money value has to be converted once,
    // here, rather than sprinkling Number() through the feature code.
    function group<T extends { customer_id: string }, R>(
      rows: T[],
      map: (row: T) => R,
    ): Map<string, R[]> {
      const out = new Map<string, R[]>()
      for (const row of rows) {
        const list = out.get(row.customer_id)
        if (list) list.push(map(row))
        else out.set(row.customer_id, [map(row)])
      }
      return out
    }

    const txByCustomer = group(txRes.rows, (r) => ({
      direction: r.direction,
      category: r.category,
      amount: Number(r.amount),
      balanceAfter: r.balance_after === null ? null : Number(r.balance_after),
      counterpartyRef: r.counterparty_ref,
      occurredAt: r.occurred_at,
    }))

    const billsByCustomer = group(billRes.rows, (r) => ({
      billerType: r.biller_type,
      billerName: r.biller_name,
      billingMonth: r.billing_month,
      dueDate: r.due_date,
      amountDue: Number(r.amount_due),
      paidAt: r.paid_at,
      status: r.status,
    }))

    const topupsByCustomer = group(topupRes.rows, (r) => ({
      amount: Number(r.amount),
      isRecurring: r.is_recurring,
      occurredAt: r.occurred_at,
    }))

    const loansByCustomer = group(loanRes.rows, (r) => ({
      status: r.status,
      outstandingBalance: Number(r.outstanding_balance),
    }))

    const repaymentsByCustomer = group(repayRes.rows, (r) => ({
      status: r.status,
      daysLate: r.days_late,
    }))

    const asOf = new Date()
    const rows: unknown[][] = []

    customers.forEach((customer, i) => {
      const bundle: SignalBundle = {
        walletOpenedAt: customer.wallet_opened_at,
        transactions: txByCustomer.get(customer.id) ?? [],
        bills: billsByCustomer.get(customer.id) ?? [],
        topups: topupsByCustomer.get(customer.id) ?? [],
        loans: loansByCustomer.get(customer.id) ?? [],
        repayments: repaymentsByCustomer.get(customer.id) ?? [],
      }
      rows.push(featuresToRow(customer.id, computeFeatures(bundle, asOf)))
      progress('computing features', i + 1, customers.length)
    })

    await bulkInsert(client, 'customer_features', [...FEATURE_COLUMNS], rows, {
      onConflict: `on conflict (customer_id) do update set ${FEATURE_COLUMNS.filter(
        (c) => c !== 'customer_id',
      )
        .map((c) => `"${c}" = excluded."${c}"`)
        .join(', ')}`,
    })

    console.log(`\n  ✓ Wrote features for ${rows.length} customers`)

    // A quick distribution readout, so an obviously broken feature run is
    // visible immediately rather than three phases later in the model.
    const { rows: stats } = await client.query<Record<string, string>>(`
      select
        round(avg(avg_monthly_inflow))::text        as avg_income,
        round(avg(income_volatility), 3)::text      as avg_volatility,
        round(avg(bill_punctuality), 3)::text       as avg_punctuality,
        round(avg(wallet_tenure_months))::text      as avg_tenure,
        round(avg(activity_density), 3)::text       as avg_activity,
        round(avg(savings_rate), 3)::text           as avg_savings,
        count(*) filter (where months_with_income = 0)::text as no_income_customers
      from customer_features
    `)

    const s = stats[0]
    console.log('\n  Population signal profile')
    console.log('  ' + '─'.repeat(46))
    console.log(`  Average monthly income      Rs ${Number(s.avg_income).toLocaleString()}`)
    console.log(`  Average income volatility   ${s.avg_volatility}`)
    console.log(`  Average bill punctuality    ${(Number(s.avg_punctuality) * 100).toFixed(1)}%`)
    console.log(`  Average wallet tenure       ${s.avg_tenure} months`)
    console.log(`  Average activity density    ${(Number(s.avg_activity) * 100).toFixed(1)}% of days`)
    console.log(`  Average savings rate        ${(Number(s.avg_savings) * 100).toFixed(1)}%`)
    console.log(`  Customers with no income    ${s.no_income_customers}`)
    console.log()
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error('\n✖ Feature build failed:', err)
  process.exit(1)
})
