/**
 * A quick look at whether the generated population is internally coherent.
 *
 *   npm run db:diagnose
 *
 * Seed data that looks fine in aggregate can still be quietly wrong in a way
 * that only shows up three phases later as a nonsensical score. This prints
 * the handful of distributions where that would first become visible.
 */
import { Client } from 'pg'
import { loadEnv, migrationConnectionString } from './env'

async function main() {
  loadEnv()
  const client = new Client({
    connectionString: migrationConnectionString(),
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 20_000,
  })
  await client.connect()

  try {
    console.log('\n  Outflow composition as a share of income\n  ' + '─'.repeat(60))
    const { rows: mix } = await client.query(`
      with income as (
        select customer_id, sum(amount) as total
          from wallet_transactions
         where direction = 'in'
           and category in ('salary','client_payment','sales_receipt','remittance')
         group by customer_id
      ),
      outflow as (
        select customer_id, category, sum(amount) as total
          from wallet_transactions
         where direction = 'out'
         group by customer_id, category
      )
      select o.category,
             round(avg(o.total / nullif(i.total, 0))::numeric, 3)::text as share_of_income
        from outflow o join income i using (customer_id)
       group by o.category
       order by avg(o.total / nullif(i.total, 0)) desc
    `)
    for (const r of mix) {
      console.log(`  ${String(r.category).padEnd(18)} ${String(r.share_of_income).padStart(8)}`)
    }

    console.log('\n  Savings rate by cohort\n  ' + '─'.repeat(60))
    const { rows: cohorts } = await client.query(`
      select coalesce(l.narrative, l.tier) as cohort,
             count(*)::text as n,
             round(avg(f.savings_rate), 3)::text as avg_savings,
             round(avg(f.avg_monthly_inflow))::text as avg_income
        from customer_features f
        join seed_labels l using (customer_id)
       group by coalesce(l.narrative, l.tier)
       order by avg(f.savings_rate) desc
    `)
    for (const r of cohorts) {
      console.log(
        `  ${String(r.cohort).padEnd(16)} n=${String(r.n).padStart(3)}  ` +
          `savings=${String(r.avg_savings).padStart(7)}  income=Rs ${Number(r.avg_income).toLocaleString()}`,
      )
    }

    console.log('\n  Savings rate excluding the fraud ring\n  ' + '─'.repeat(60))
    const { rows: clean } = await client.query(`
      select round(avg(f.savings_rate), 3)::text as avg_savings,
             round(min(f.savings_rate), 3)::text as min_savings,
             round(max(f.savings_rate), 3)::text as max_savings,
             count(*) filter (where f.savings_rate < -0.5)::text as very_negative
        from customer_features f
        join seed_labels l using (customer_id)
       where l.narrative is distinct from 'fraud_ring'
    `)
    console.log(
      `  avg=${clean[0].avg_savings}  min=${clean[0].min_savings}  ` +
        `max=${clean[0].max_savings}  below -50%: ${clean[0].very_negative}`,
    )

    console.log('\n  Worst offenders (non-ring)\n  ' + '─'.repeat(60))
    const { rows: worst } = await client.query(`
      select c.full_name, l.tier, c.persona,
             round(f.avg_monthly_inflow)::text as income,
             round(f.avg_monthly_outflow)::text as outflow,
             round(f.savings_rate, 3)::text as savings
        from customer_features f
        join customers c on c.id = f.customer_id
        join seed_labels l using (customer_id)
       where l.narrative is distinct from 'fraud_ring'
       order by f.savings_rate
       limit 6
    `)
    for (const r of worst) {
      console.log(
        `  ${String(r.full_name).padEnd(20)} ${String(r.tier).padEnd(11)} ` +
          `in=${String(Number(r.income).toLocaleString()).padStart(8)} ` +
          `out=${String(Number(r.outflow).toLocaleString()).padStart(8)} ` +
          `savings=${String(r.savings).padStart(7)}`,
      )
    }
    console.log()
  } finally {
    await client.end()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
