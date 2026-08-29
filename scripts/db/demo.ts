/**
 * Rebuild the entire demo from nothing, in one command.
 *
 *   npm run demo
 *
 * Runs every stage in order: migrate, seed, features, train, score, fraud,
 * monitor, staff accounts. Deterministic, so the same command always produces
 * the same population — a demo script that quotes a score stays true.
 *
 * This exists because "which of the eight scripts do I run, and in what order?"
 * is exactly the question you do not want to be answering ten minutes before a
 * demo. Each stage prints what it did; the whole thing takes a few minutes.
 */
import { spawn } from 'node:child_process'
import { Client } from 'pg'
import { loadEnv, migrationConnectionString } from './env'

interface Stage {
  name: string
  script: string
  args?: string[]
  /** Why this stage exists, printed as it runs. */
  purpose: string
  /** Skipped unless --full. Training takes the longest and rarely changes. */
  optional?: boolean
}

const STAGES: Stage[] = [
  {
    name: 'Schema',
    script: 'scripts/db/migrate.ts',
    purpose: 'Apply every migration',
  },
  {
    name: 'Population',
    script: 'scripts/db/seed.ts',
    args: ['--wipe'],
    purpose: 'Generate the synthetic Pakistani informal-worker population',
  },
  {
    name: 'Features',
    script: 'scripts/db/build-features.ts',
    purpose: 'Turn raw transactions into engineered signals',
  },
  {
    name: 'Model',
    script: 'scripts/model/train.ts',
    purpose: 'Refit the scorecard against the new population',
    optional: true,
  },
  {
    name: 'Scores',
    script: 'scripts/db/build-scores.ts',
    purpose: 'Score every customer',
  },
  {
    name: 'FraudSense',
    script: 'scripts/db/build-fraud.ts',
    purpose: 'Run the detectors and rebuild the relationship graph',
  },
  {
    name: 'Monitoring',
    script: 'scripts/db/monitor.ts',
    purpose: 'Re-score live exposure and raise early-warning alerts',
  },
  {
    name: 'Staff accounts',
    script: 'scripts/db/seed-users.ts',
    args: ['--reset'],
    purpose: 'Create one signed-in account per role',
  },
]

function run(stage: Stage): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.platform === 'win32' ? 'npx.cmd' : 'npx',
      ['tsx', stage.script, ...(stage.args ?? [])],
      { stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' },
    )

    let lastLine = ''

    const forward = (chunk: Buffer) => {
      const text = chunk.toString()
      // The sub-scripts draw progress bars with \r. Forwarding those verbatim
      // makes the combined output unreadable, so only the final state of each
      // line is kept.
      for (const line of text.split('\n')) {
        if (line.includes('\r')) {
          lastLine = line.split('\r').pop() ?? ''
          continue
        }
        if (line.trim()) console.log(`    ${line.trimEnd()}`)
      }
    }

    child.stdout.on('data', forward)
    child.stderr.on('data', forward)

    child.on('close', (code) => {
      if (lastLine.trim()) console.log(`    ${lastLine.trimEnd()}`)
      if (code === 0) resolve()
      else reject(new Error(`${stage.name} exited with code ${code}`))
    })
    child.on('error', reject)
  })
}

async function main() {
  loadEnv()

  const full = process.argv.includes('--full')
  const started = Date.now()

  console.log('\n╭' + '─'.repeat(66) + '╮')
  console.log('│  CreditSense AI — rebuilding the demo from nothing' + ' '.repeat(16) + '│')
  console.log('╰' + '─'.repeat(66) + '╯')
  if (!full) {
    console.log('\n  Model training is skipped. Add --full to refit the scorecard.')
  }

  const stages = STAGES.filter((s) => full || !s.optional)

  for (const [i, stage] of stages.entries()) {
    console.log(`\n  [${i + 1}/${stages.length}] ${stage.name} — ${stage.purpose}`)
    console.log('  ' + '─'.repeat(66))
    await run(stage)
  }

  // ---- final state ----
  const client = new Client({
    connectionString: migrationConnectionString(),
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 20_000,
  })
  await client.connect()

  try {
    const { rows } = await client.query<{ label: string; value: string; sort: string }>(`
      select 'Customers' as label, count(*)::text as value, '1' as sort from customers
      union all select 'Wallet transactions', count(*)::text, '2' from wallet_transactions
      union all select 'Bill payments', count(*)::text, '3' from bill_payments
      union all select 'Scored', count(*)::text, '4' from current_credit_scores
      union all select 'Open applications', count(*)::text, '5' from applications where status in ('pending','in_review')
      union all select 'Active loans', count(*)::text, '6' from loans where status in ('active','delinquent')
      union all select 'Fraud clusters', count(*)::text, '7' from fraud_clusters
      union all select 'Open alerts', count(*)::text, '8' from monitoring_alerts where status = 'open'
      order by sort
    `)

    console.log('\n╭' + '─'.repeat(66) + '╮')
    console.log('│  Demo is ready' + ' '.repeat(51) + '│')
    console.log('╰' + '─'.repeat(66) + '╯\n')

    for (const row of rows) {
      console.log(`  ${row.label.padEnd(24)} ${Number(row.value).toLocaleString().padStart(10)}`)
    }

    // The three narratives, with the numbers the demo script quotes.
    const { rows: narratives } = await client.query<{
      narrative: string
      full_name: string
      score: number | null
      risk_band: string | null
      fraud_level: string | null
      alerts: string
    }>(`
      select l.narrative, c.full_name, s.score, s.risk_band, f.level as fraud_level,
             (select count(*) from monitoring_alerts m
               where m.customer_id = c.id and m.status = 'open')::text as alerts
        from seed_labels l
        join customers c on c.id = l.customer_id
        left join current_credit_scores s on s.customer_id = c.id
        left join current_fraud_assessments f on f.customer_id = c.id
       where l.narrative is not null
       order by l.narrative, s.score desc nulls last
    `)

    console.log('\n  The three demo narratives')
    console.log('  ' + '─'.repeat(66))
    let lastNarrative = ''
    for (const row of narratives) {
      if (row.narrative !== lastNarrative) {
        console.log(`\n  ${row.narrative.replace(/_/g, ' ').toUpperCase()}`)
        lastNarrative = row.narrative
      }
      console.log(
        `    ${row.full_name.padEnd(22)} score ${String(row.score ?? '—').padStart(4)}  ` +
          `${(row.risk_band ?? '—').padEnd(11)} fraud ${(row.fraud_level ?? '—').padEnd(12)} ` +
          `${row.alerts} alert${row.alerts === '1' ? '' : 's'}`,
      )
    }

    const elapsed = Math.round((Date.now() - started) / 1000)
    console.log(`\n  Built in ${Math.floor(elapsed / 60)}m ${elapsed % 60}s\n`)
    console.log('  Sign in at http://localhost:3000/login')
    console.log('    admin@creditsense.pk    · everything')
    console.log('    officer@creditsense.pk  · the decision queue')
    console.log('    risk@creditsense.pk     · portfolio and monitoring')
    console.log('    fraud@creditsense.pk    · FraudSense and the graph')
    console.log('    password: CreditSense2026!\n')
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error(`\n✖ Demo build failed: ${err instanceof Error ? err.message : err}\n`)
  process.exit(1)
})
