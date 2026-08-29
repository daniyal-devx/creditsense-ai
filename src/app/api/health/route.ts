import { NextResponse } from 'next/server'
import { checkDbHealth, isDbConfigured } from '@/lib/db/client'

// Health must reflect the state right now, never a cached response.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * GET /api/health
 *
 * Phase 0's "can the deployed app actually query the database?" check, and the
 * endpoint to hit first whenever a Vercel deploy misbehaves.
 *
 * Returns 503 when the database is unreachable so uptime monitoring can key
 * off the status code rather than parsing the body.
 */
export async function GET() {
  const startedAt = Date.now()

  if (!isDbConfigured()) {
    return NextResponse.json(
      {
        status: 'misconfigured',
        database: {
          ok: false,
          error: 'DATABASE_URL is not set for this environment.',
        },
        checkedAt: new Date().toISOString(),
      },
      { status: 503 },
    )
  }

  const database = await checkDbHealth()

  return NextResponse.json(
    {
      status: database.ok ? 'ok' : 'degraded',
      app: {
        environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'unknown',
        commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      },
      database: {
        ok: database.ok,
        latencyMs: database.latencyMs,
        postgresVersion: database.version ?? null,
        publicTables: database.tableCount ?? null,
        // Phase 1 creates the schema; until then an empty database is expected,
        // not a fault.
        migrationsApplied: (database.tableCount ?? 0) > 0,
        error: database.error ?? null,
      },
      totalMs: Date.now() - startedAt,
      checkedAt: new Date().toISOString(),
    },
    { status: database.ok ? 200 : 503 },
  )
}
