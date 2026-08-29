import 'server-only'
import { query, queryOne } from '@/lib/db/client'

/**
 * Rate limiting for the auth endpoints.
 *
 * Backed by the database rather than an in-memory counter, because the app
 * runs on Vercel: every request may land on a different serverless instance,
 * so an in-process Map would let an attacker reset their budget simply by
 * being routed elsewhere.
 *
 * Every limit is applied twice — once keyed on the account being targeted and
 * once on the caller's IP. Keying on only one leaves an obvious hole: by email
 * alone, one IP can spray thousands of accounts; by IP alone, a distributed
 * attacker can still grind a single account down.
 */

export type RateLimitAction =
  | 'login'
  | 'signup'
  | 'verify_code'
  | 'resend_code'
  | 'password_reset'

interface LimitRule {
  /** Attempts allowed inside the window. */
  max: number
  windowMinutes: number
  /** How long to lock out once the limit is hit. */
  lockoutMinutes: number
}

/**
 * Deliberately asymmetric.
 *
 * `verify_code` is the tightest: six digits is only a million possibilities,
 * and the per-code attempt cap alone would not stop someone requesting a fresh
 * code and burning five guesses on each.
 *
 * `login` is looser than it could be, because a legitimate user genuinely does
 * mistype a password several times — locking them out of a work tool is a real
 * cost, and bcrypt already makes each guess expensive.
 */
const RULES: Record<RateLimitAction, { byIdentifier: LimitRule; byIp: LimitRule }> = {
  login: {
    byIdentifier: { max: 8, windowMinutes: 15, lockoutMinutes: 15 },
    byIp: { max: 30, windowMinutes: 15, lockoutMinutes: 15 },
  },
  signup: {
    byIdentifier: { max: 3, windowMinutes: 60, lockoutMinutes: 60 },
    byIp: { max: 10, windowMinutes: 60, lockoutMinutes: 30 },
  },
  verify_code: {
    byIdentifier: { max: 10, windowMinutes: 15, lockoutMinutes: 30 },
    byIp: { max: 40, windowMinutes: 15, lockoutMinutes: 15 },
  },
  resend_code: {
    byIdentifier: { max: 5, windowMinutes: 60, lockoutMinutes: 30 },
    byIp: { max: 20, windowMinutes: 60, lockoutMinutes: 15 },
  },
  password_reset: {
    byIdentifier: { max: 4, windowMinutes: 60, lockoutMinutes: 30 },
    byIp: { max: 15, windowMinutes: 60, lockoutMinutes: 30 },
  },
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  /** Seconds until the caller may try again. Only set when blocked. */
  retryAfterSeconds?: number
  reason?: string
}

/**
 * Check a limit without consuming it.
 *
 * Only failed attempts count. A user who signs in correctly ten times in a row
 * is not attacking anything, and counting successes would lock out a busy
 * loan officer for doing their job.
 */
export async function checkRateLimit(
  action: RateLimitAction,
  identifier: string,
  ipAddress: string | null,
): Promise<RateLimitResult> {
  const rules = RULES[action]

  const identifierResult = await checkOne(action, identifier.toLowerCase(), rules.byIdentifier)
  if (!identifierResult.allowed) return identifierResult

  if (ipAddress) {
    const ipResult = await checkOne(action, `ip:${ipAddress}`, rules.byIp)
    if (!ipResult.allowed) {
      return { ...ipResult, reason: 'Too many attempts from this network.' }
    }
    return {
      allowed: true,
      remaining: Math.min(identifierResult.remaining, ipResult.remaining),
    }
  }

  return identifierResult
}

async function checkOne(
  action: RateLimitAction,
  key: string,
  rule: LimitRule,
): Promise<RateLimitResult> {
  const row = await queryOne<{ failures: string; oldest: Date | null }>(
    `select count(*)::text as failures, min(created_at) as oldest
       from login_attempts
      where identifier = $1
        and action = $2
        and successful = false
        and created_at > now() - ($3 || ' minutes')::interval`,
    [key, action, String(rule.windowMinutes)],
  )

  const failures = Number(row?.failures ?? 0)

  if (failures >= rule.max) {
    // Lock out from the most recent failure, not the oldest — otherwise the
    // lockout silently expires while the attacker is still hammering.
    const last = await queryOne<{ last_attempt: Date }>(
      `select max(created_at) as last_attempt
         from login_attempts
        where identifier = $1 and action = $2 and successful = false`,
      [key, action],
    )
    const lockoutEnds = new Date(
      (last?.last_attempt?.getTime() ?? Date.now()) + rule.lockoutMinutes * 60_000,
    )
    const retryAfterSeconds = Math.max(1, Math.ceil((lockoutEnds.getTime() - Date.now()) / 1000))

    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds,
      reason: `Too many attempts. Try again in ${formatRetry(retryAfterSeconds)}.`,
    }
  }

  return { allowed: true, remaining: rule.max - failures }
}

/** Record an attempt. Call this after every auth attempt, success or failure. */
export async function recordAttempt(
  action: RateLimitAction,
  identifier: string,
  successful: boolean,
  ipAddress: string | null,
): Promise<void> {
  try {
    await query(
      `insert into login_attempts (identifier, action, successful, ip_address)
       values ($1, $2, $3, $4::inet)`,
      [identifier.toLowerCase(), action, successful, ipAddress],
    )
    if (ipAddress) {
      await query(
        `insert into login_attempts (identifier, action, successful, ip_address)
         values ($1, $2, $3, $4::inet)`,
        [`ip:${ipAddress}`, action, successful, ipAddress],
      )
    }
    // A success clears the account's failure history, so a user who finally
    // remembers their password starts from a clean slate.
    if (successful) {
      await query(
        `delete from login_attempts
          where identifier = $1 and action = $2 and successful = false`,
        [identifier.toLowerCase(), action],
      )
    }
  } catch (err) {
    // Rate limiting must never take down the endpoint it protects. Log and
    // continue: the auth check itself still runs.
    console.error('[rate-limit] failed to record attempt:', err)
  }
}

function formatRetry(seconds: number): string {
  if (seconds < 60) return `${seconds} seconds`
  const minutes = Math.ceil(seconds / 60)
  return minutes === 1 ? 'a minute' : `${minutes} minutes`
}

/**
 * The caller's IP.
 *
 * On Vercel the client IP is the first entry in x-forwarded-for; the rest are
 * proxies. Taking the last entry (or trusting the header wholesale) would let
 * a caller spoof their way past the IP limit by sending their own header.
 */
export function clientIp(headers: Headers): string | null {
  const forwarded = headers.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }
  return headers.get('x-real-ip') ?? null
}
