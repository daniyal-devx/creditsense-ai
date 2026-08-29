import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { config } from 'dotenv'

/**
 * Load environment variables for a standalone script.
 *
 * Next.js loads .env.local automatically for the app, but these scripts run
 * outside Next, so they have to do it themselves. Precedence matches Next's:
 * .env.local wins over .env, and anything already in the real environment
 * (a CI secret, a Vercel build var) wins over both.
 */
export function loadEnv(): void {
  for (const file of ['.env.local', '.env']) {
    const path = join(process.cwd(), file)
    if (existsSync(path)) {
      config({ path, override: false, quiet: true })
    }
  }
}

/** Read a required variable, failing with a useful message rather than `undefined`. */
export function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    console.error(
      `✖ ${name} is not set.\n` +
        '  Copy .env.example to .env.local and fill it in:\n' +
        '    cp .env.example .env.local        (PowerShell: copy .env.example .env.local)',
    )
    process.exit(1)
  }
  return value
}

/** The connection string for schema work and bulk loads. */
export function migrationConnectionString(): string {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL
  if (!url) {
    console.error('✖ Neither DIRECT_URL nor DATABASE_URL is set. See .env.example.')
    process.exit(1)
  }
  return url
}
