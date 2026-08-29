/**
 * Drop everything and rebuild from scratch.
 *
 *   npm run db:reset -- --yes
 *
 * Destructive by design, so it refuses to run without an explicit --yes, and
 * refuses outright against a production database. It exists because "the seed
 * is in a weird state" is otherwise a twenty-minute detour, and because a
 * demo you cannot rebuild in one command is a demo you will eventually be
 * unable to give.
 */
import { Client } from 'pg'
import { loadEnv, migrationConnectionString } from './env'

const TABLES = [
  'seed_labels',
  'customer_features',
  'repayments',
  'loans',
  'bill_payments',
  'topups',
  'wallet_transactions',
  'applications',
  'customers',
  'schema_migrations',
]

async function main() {
  loadEnv()

  if (!process.argv.includes('--yes')) {
    console.log(
      '\n  This drops every table in the public schema and all of its data.\n' +
        '  Re-run with --yes if that is what you want:\n\n' +
        '    npm run db:reset -- --yes\n',
    )
    process.exit(1)
  }

  if (process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production') {
    console.error('\n✖ Refusing to reset a production database.\n')
    process.exit(1)
  }

  const client = new Client({
    connectionString: migrationConnectionString(),
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 20_000,
  })
  await client.connect()

  try {
    console.log('\n  Dropping tables …')
    // CASCADE takes the dependent views and constraints with it, so the order
    // of the list only affects the log output, not correctness.
    for (const table of TABLES) {
      await client.query(`drop table if exists ${table} cascade`)
      console.log(`    dropped ${table}`)
    }
    await client.query('drop view if exists customer_signal_summary cascade')
    await client.query('drop function if exists set_updated_at() cascade')
    await client.query('drop function if exists bill_days_late(date, timestamptz) cascade')

    console.log('\n  Done. Rebuild with:\n')
    console.log('    npm run db:migrate')
    console.log('    npm run db:seed')
    console.log('    npm run db:features\n')
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error('\n✖ Reset failed:', err)
  process.exit(1)
})
