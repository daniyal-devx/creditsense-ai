import 'server-only'
import { Pool, type PoolClient, type QueryResultRow } from 'pg'

/**
 * The database connection.
 *
 * Architecture note — why raw Postgres and not PostgREST/supabase-js:
 *
 * We run our own auth (Phase 2), which makes the Next.js server the trusted
 * layer. It authenticates the user, resolves their role, and only then reads
 * data. Going through PostgREST would mean expressing our lending-specific
 * permission model as RLS policies evaluated against a JWT we do not issue —
 * more moving parts, and a second place for permission logic to drift out of
 * sync. Talking to Postgres directly keeps authorisation in exactly one place
 * and gives us real SQL for the portfolio and risk aggregations in Phase 6/7.
 *
 * supabase-js is still used, but only for Realtime subscriptions in the
 * browser (Phase 6).
 *
 * Connection note: Supabase's direct host (db.<ref>.supabase.co) is IPv6-only
 * and unreachable from Vercel's serverless runtime. DATABASE_URL must point at
 * the *pooler* on port 6543 (transaction mode), which is also the right choice
 * for serverless: many short-lived queries, no long-held sessions.
 */

declare global {
  var __creditsense_pool: Pool | undefined
}

function connectionString(): string {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Copy .env.example to .env.local and fill in the Supabase pooler connection string.',
    )
  }
  return url
}

function createPool(): Pool {
  const pool = new Pool({
    connectionString: connectionString(),
    // Supabase terminates TLS with a certificate chain Node does not ship a
    // root for. The connection is still encrypted; we just cannot verify the
    // chain locally.
    ssl: { rejectUnauthorized: false },
    // A serverless instance handles one request at a time, so a large pool
    // per instance only burns pooler slots that other instances need.
    max: process.env.NODE_ENV === 'production' ? 4 : 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
    // pgbouncer in transaction mode cannot hold named prepared statements
    // across a transaction boundary.
    statement_timeout: 30_000,
  })

  pool.on('error', (err) => {
    // A pooled connection dying in the background must never take the process
    // down — pg re-establishes it on the next checkout.
    console.error('[db] idle client error:', err.message)
  })

  return pool
}

/**
 * One pool per process. Cached on `globalThis` so Next's dev-mode hot reload
 * does not leak a new pool on every file save.
 */
export function getPool(): Pool {
  if (!global.__creditsense_pool) {
    global.__creditsense_pool = createPool()
  }
  return global.__creditsense_pool
}

/** Run a parameterised query. Always pass values as `$1, $2…` — never interpolate. */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: readonly unknown[] = [],
): Promise<T[]> {
  const started = Date.now()
  try {
    const result = await getPool().query<T>(text, params as unknown[])
    if (process.env.NODE_ENV === 'development') {
      const ms = Date.now() - started
      if (ms > 400) {
        console.warn(`[db] slow query ${ms}ms: ${text.replace(/\s+/g, ' ').slice(0, 120)}`)
      }
    }
    return result.rows
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[db] query failed: ${message}\n  SQL: ${text.replace(/\s+/g, ' ').slice(0, 200)}`)
    throw err
  }
}

/** Exactly one row, or `null`. Throws if the query returns more than one. */
export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: readonly unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params)
  if (rows.length > 1) {
    throw new Error(`Expected at most 1 row, got ${rows.length}`)
  }
  return rows[0] ?? null
}

/** A single scalar value from the first column of the first row. */
export async function queryValue<T>(text: string, params: readonly unknown[] = []): Promise<T | null> {
  const rows = await query(text, params)
  if (rows.length === 0) return null
  const first = rows[0]
  const key = Object.keys(first)[0]
  return (first[key] as T) ?? null
}

/**
 * Run several statements atomically. The callback gets a dedicated client;
 * rollback happens automatically if it throws.
 *
 *   await transaction(async (tx) => {
 *     await tx.query('update applications set status = $1 where id = $2', ['approved', id])
 *     await tx.query('insert into audit_log (...) values (...)', [...])
 *   })
 */
export async function transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    try {
      await client.query('ROLLBACK')
    } catch (rollbackErr) {
      console.error('[db] rollback failed:', rollbackErr)
    }
    throw err
  } finally {
    client.release()
  }
}

export interface DbHealth {
  ok: boolean
  /** Round-trip latency in ms. */
  latencyMs: number
  version?: string
  /** How many tables exist in the public schema — 0 means migrations have not run. */
  tableCount?: number
  error?: string
}

/** Used by `/api/health` and by the Phase 0 "can we query the database?" check. */
export async function checkDbHealth(): Promise<DbHealth> {
  const started = Date.now()
  try {
    const row = await queryOne<{ version: string; table_count: string }>(
      `select
         current_setting('server_version') as version,
         (select count(*) from information_schema.tables
           where table_schema = 'public' and table_type = 'BASE TABLE')::text as table_count`,
    )
    return {
      ok: true,
      latencyMs: Date.now() - started,
      version: row?.version,
      tableCount: row ? Number(row.table_count) : undefined,
    }
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/** True when a DATABASE_URL is configured at all. */
export function isDbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL)
}
