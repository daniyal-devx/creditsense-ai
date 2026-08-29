import 'server-only'
import bcrypt from 'bcryptjs'
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'

/**
 * Password hashing and one-time codes.
 *
 * Two different primitives on purpose:
 *
 *   Passwords use bcrypt at 12 rounds. They are low-entropy, human-chosen, and
 *   long-lived, so the hash has to be deliberately slow to make an offline
 *   dictionary attack against a stolen database impractical.
 *
 *   Verification codes use SHA-256. They are randomly generated, expire in ten
 *   minutes, and are attempt-capped, so their security comes from the short
 *   window and the cap rather than from the cost of the hash. Running bcrypt
 *   on every code check would add ~250ms to a request for no security gain.
 */

const BCRYPT_ROUNDS = 12

/**
 * Password strength rules live in `password-rules.ts` — no `server-only`
 * import — so the signup form and this module run the exact same function.
 * Re-exported here so server code has one place to import from.
 */
export {
  checkPasswordStrength,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  type PasswordCheck,
} from './password-rules'

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS)
}

/**
 * Verify a password.
 *
 * `storedHash` may be null for a Google-only account. Even then this runs a
 * real bcrypt comparison against a dummy hash before returning false, so the
 * response time does not reveal whether the account exists or has a password —
 * that timing difference is a working account-enumeration oracle.
 */
const DUMMY_HASH = '$2a$12$C6UzMDM.H6dfI/f/IKcEe.7yBnTd7Ic3fUOfLxvHnP3cvOo4ZTgIm'

export async function verifyPassword(password: string, storedHash: string | null): Promise<boolean> {
  if (!storedHash) {
    await bcrypt.compare(password, DUMMY_HASH)
    return false
  }
  return bcrypt.compare(password, storedHash)
}

// ---------------------------------------------------------------------------
// One-time codes
// ---------------------------------------------------------------------------

export const CODE_LENGTH = 6
export const CODE_TTL_MINUTES = 10
export const CODE_MAX_ATTEMPTS = 5
export const RESEND_COOLDOWN_SECONDS = 60

/**
 * A six-digit code from a cryptographically secure source.
 *
 * `randomInt` is used rather than `Math.random()` — a predictable code is the
 * same as no code at all, and Math.random is entirely predictable given a few
 * outputs.
 */
export function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(CODE_LENGTH, '0')
}

export function hashCode(code: string): string {
  return createHash('sha256').update(code.trim()).digest('hex')
}

/** Compare hashes in constant time so the check cannot be timed character by character. */
export function codeMatches(code: string, storedHash: string): boolean {
  const candidate = Buffer.from(hashCode(code), 'hex')
  let stored: Buffer
  try {
    stored = Buffer.from(storedHash, 'hex')
  } catch {
    return false
  }
  if (candidate.length !== stored.length) return false
  return timingSafeEqual(candidate, stored)
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

/** An opaque, URL-safe, high-entropy token — for sessions and OAuth state. */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

/** Session tokens are stored hashed, so a database leak cannot be replayed. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** Lowercased and trimmed, so one person cannot register the same address twice. */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase()
}
