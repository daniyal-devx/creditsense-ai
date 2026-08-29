/**
 * Create the demo staff accounts.
 *
 *   npm run db:seed-users
 *   npm run db:seed-users -- --reset   reset their passwords back to the default
 *
 * One account per role, already verified, so the role model can be
 * demonstrated without four separate signup-and-verify round trips.
 *
 * These are demo credentials in a demo environment and are printed to the
 * console on purpose. The script refuses to run against production.
 */
import bcrypt from 'bcryptjs'
import { Client } from 'pg'
import { loadEnv, migrationConnectionString } from './env'

const DEMO_PASSWORD = 'CreditSense2026!'

const ACCOUNTS = [
  {
    email: 'admin@creditsense.pk',
    fullName: 'Sana Iqbal',
    role: 'admin',
    note: 'Full access, including user management and the audit trail',
  },
  {
    email: 'officer@creditsense.pk',
    fullName: 'Bilal Ahmed',
    role: 'loan_officer',
    note: 'Reviews applications and makes approve / reject decisions',
  },
  {
    email: 'risk@creditsense.pk',
    fullName: 'Hina Raza',
    role: 'risk_analyst',
    note: 'Portfolio risk distribution, trends and early warnings',
  },
  {
    email: 'fraud@creditsense.pk',
    fullName: 'Usman Tariq',
    role: 'fraud_analyst',
    note: 'Flagged applicants and the relationship graph',
  },
] as const

async function main() {
  loadEnv()

  if (process.env.VERCEL_ENV === 'production') {
    console.error('\n✖ Refusing to create demo accounts in production.\n')
    process.exit(1)
  }

  const reset = process.argv.includes('--reset')

  const client = new Client({
    connectionString: migrationConnectionString(),
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 20_000,
  })
  await client.connect()

  try {
    console.log('\n  Creating demo staff accounts\n')

    // Hash once and reuse: bcrypt at 12 rounds costs ~250ms, and four
    // identical passwords do not need four separate hashes.
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12)

    for (const account of ACCOUNTS) {
      const emailNormalised = account.email.toLowerCase()

      const result = await client.query(
        `insert into users
           (email, email_normalised, full_name, password_hash, role, status,
            email_verified_at, auth_providers)
         values ($1, $2, $3, $4, $5, 'active', now(), array['password']::text[])
         on conflict (email_normalised) do update
           set full_name     = excluded.full_name,
               role          = excluded.role,
               status        = 'active',
               -- Only overwrite the password when explicitly asked, so a
               -- re-run does not silently reset someone's changed password.
               password_hash = case when $6 then excluded.password_hash else users.password_hash end
         returning id, (xmax = 0) as inserted`,
        [
          account.email,
          emailNormalised,
          account.fullName,
          passwordHash,
          account.role,
          reset,
        ],
      )

      const wasInserted = result.rows[0]?.inserted
      console.log(
        `  ${wasInserted ? '✓ created ' : '· updated '} ${account.email.padEnd(28)} ${account.role}`,
      )
    }

    console.log('\n  Sign in with any of these:\n')
    console.log('  ' + '─'.repeat(72))
    for (const account of ACCOUNTS) {
      console.log(`  ${account.email.padEnd(28)} ${account.note}`)
    }
    console.log('  ' + '─'.repeat(72))
    console.log(`\n  Password for all four:  ${DEMO_PASSWORD}\n`)
    console.log('  These are demo credentials for a demo database. Never use them anywhere real.\n')
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error('\n✖ Could not create the demo accounts:', err)
  process.exit(1)
})
