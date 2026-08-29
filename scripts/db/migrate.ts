/**
 * Migration runner.
 *
 *   npm run db:migrate          apply every pending migration
 *   npm run db:migrate -- --status   show what is applied and what is pending
 *
 * Migrations are plain .sql files in supabase/migrations, applied in filename
 * order and recorded in `schema_migrations`. Each runs inside a transaction, so
 * a failure half-way leaves the database exactly as it was.
 *
 * It connects over DIRECT_URL (the session pooler, port 5432) rather than
 * DATABASE_URL (transaction pooler, 6543): DDL and advisory locks need a
 * stable session, which transaction-mode pooling does not give you.
 */
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { Client } from 'pg'
import { loadEnv } from './env'

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations')

// Any positive 32-bit integer; it only has to be the same across runs so two
// concurrent deploys cannot apply the same migration twice.
const ADVISORY_LOCK_KEY = 4_192_734

interface MigrationFile {
  version: string
  filename: string
  sql: string
  checksum: string
}

function loadMigrations(): MigrationFile[] {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  return files.map((filename) => {
    const sql = readFileSync(join(MIGRATIONS_DIR, filename), 'utf8')
    return {
      filename,
      version: filename.replace(/\.sql$/, ''),
      sql,
      checksum: createHash('sha256').update(sql).digest('hex').slice(0, 16),
    }
  })
}

async function main() {
  loadEnv()

  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL
  if (!connectionString) {
    console.error('✖ DIRECT_URL (or DATABASE_URL) is not set. Copy .env.example to .env.local.')
    process.exit(1)
  }

  const statusOnly = process.argv.includes('--status')
  const migrations = loadMigrations()

  if (migrations.length === 0) {
    console.log('No migration files found in supabase/migrations.')
    return
  }

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 20_000,
  })

  await client.connect()

  try {
    // The very first migration creates this table, so it has to exist before
    // we can ask what has been applied.
    await client.query(`
      create table if not exists schema_migrations (
        version    text primary key,
        applied_at timestamptz not null default now(),
        checksum   text
      )
    `)

    const { rows } = await client.query<{ version: string; checksum: string | null; applied_at: Date }>(
      'select version, checksum, applied_at from schema_migrations order by version',
    )
    const applied = new Map(rows.map((r) => [r.version, r]))

    if (statusOnly) {
      console.log('\n  Migration status\n  ' + '─'.repeat(58))
      for (const m of migrations) {
        const record = applied.get(m.version)
        if (!record) {
          console.log(`  ○ pending   ${m.filename}`)
        } else if (record.checksum && record.checksum !== m.checksum) {
          console.log(`  ⚠ CHANGED   ${m.filename}  (applied checksum differs from the file on disk)`)
        } else {
          console.log(`  ● applied   ${m.filename}  ${record.applied_at.toISOString().slice(0, 19)}`)
        }
      }
      console.log()
      return
    }

    // Stop two deploys racing each other through the same migration.
    await client.query('select pg_advisory_lock($1)', [ADVISORY_LOCK_KEY])

    let appliedCount = 0

    try {
      for (const migration of migrations) {
        const record = applied.get(migration.version)

        if (record) {
          if (record.checksum && record.checksum !== migration.checksum) {
            console.warn(
              `  ⚠ ${migration.filename} has changed since it was applied.\n` +
                '    Editing an applied migration means two environments now have different schemas.\n' +
                '    Write a new migration instead.',
            )
          }
          continue
        }

        process.stdout.write(`  → applying ${migration.filename} … `)
        const started = Date.now()

        try {
          await client.query('BEGIN')
          await client.query(migration.sql)
          await client.query(
            'insert into schema_migrations (version, checksum) values ($1, $2)',
            [migration.version, migration.checksum],
          )
          await client.query('COMMIT')
          appliedCount++
          console.log(`ok (${Date.now() - started}ms)`)
        } catch (err) {
          await client.query('ROLLBACK')
          console.log('FAILED')
          console.error(`\n✖ ${migration.filename} failed and was rolled back:\n`)
          console.error(err instanceof Error ? err.message : err)
          process.exit(1)
        }
      }
    } finally {
      await client.query('select pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY])
    }

    if (appliedCount === 0) {
      console.log('  Database is already up to date.')
    } else {
      console.log(`\n  Applied ${appliedCount} migration${appliedCount === 1 ? '' : 's'}.`)
    }

    const { rows: tables } = await client.query<{ count: string }>(
      `select count(*)::text as count from information_schema.tables
        where table_schema = 'public' and table_type = 'BASE TABLE'`,
    )
    console.log(`  public schema now has ${tables[0].count} tables.\n`)
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error('✖ Migration run failed:', err)
  process.exit(1)
})
