import 'server-only'
import { query, queryOne, transaction } from '@/lib/db/client'
import { sendEmail } from '@/lib/email/send'
import {
  newLoginAlertEmail,
  passwordResetEmail,
  verificationCodeEmail,
  welcomeEmail,
} from '@/lib/email/templates'
import { recordAudit } from './audit'
import {
  CODE_MAX_ATTEMPTS,
  CODE_TTL_MINUTES,
  RESEND_COOLDOWN_SECONDS,
  checkPasswordStrength,
  codeMatches,
  generateCode,
  hashCode,
  hashPassword,
  normaliseEmail,
  verifyPassword,
} from './password'
import { checkRateLimit, recordAttempt } from './rate-limit'
import { ROLE_DEFINITIONS, type Role } from './roles'
import { createSession, isNewDevice, revokeAllSessions } from './session'

/**
 * The auth flows.
 *
 * A rule that runs through all of it: **never reveal whether an email is
 * registered.** Signup, login and password-reset all return the same shape of
 * response whether or not the account exists. Otherwise the signup form
 * becomes a free tool for enumerating which staff of which lender have
 * accounts — the first step in a targeted phishing campaign.
 *
 * The cost is a slightly less helpful error message. That is the right trade
 * for a system holding applicant financial records.
 */

export interface RequestContext {
  ipAddress: string | null
  userAgent: string | null
}

export type AuthResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? { data?: undefined } : { data: T }))
  | { ok: false; error: string; field?: string; retryAfterSeconds?: number }

function fail(error: string, field?: string, retryAfterSeconds?: number): AuthResult<never> {
  return { ok: false, error, field, retryAfterSeconds }
}

const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ?? 'http://localhost:3000'

// ---------------------------------------------------------------------------
// Signup
// ---------------------------------------------------------------------------

export interface SignupInput {
  fullName: string
  email: string
  password: string
}

export async function signup(
  input: SignupInput,
  ctx: RequestContext,
): Promise<AuthResult<{ email: string; emailSent: boolean }>> {
  const email = normaliseEmail(input.email)
  const fullName = input.fullName.trim()

  if (fullName.length < 2) return fail('Enter your full name.', 'fullName')
  if (fullName.length > 120) return fail('That name is too long.', 'fullName')
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return fail('Enter a valid email address.', 'email')
  }

  const strength = checkPasswordStrength(input.password, { email, name: fullName })
  if (!strength.valid) return fail(strength.problems[0], 'password')

  const limit = await checkRateLimit('signup', email, ctx.ipAddress)
  if (!limit.allowed) {
    return fail(limit.reason ?? 'Too many attempts.', undefined, limit.retryAfterSeconds)
  }

  const existing = await queryOne<{ id: string; status: string; full_name: string }>(
    'select id, status, full_name from users where email_normalised = $1',
    [email],
  )

  // The account exists. Rather than saying so, take the action that helps a
  // legitimate user without confirming anything to an attacker: if they never
  // verified, re-send the code; if they did, stay silent. Either way the
  // response below is identical.
  if (existing) {
    await recordAttempt('signup', email, false, ctx.ipAddress)
    if (existing.status === 'unverified') {
      await issueCode(existing.id, existing.full_name, email, 'email_verification')
    }
    return { ok: true, data: { email, emailSent: true } }
  }

  const passwordHash = await hashPassword(input.password)

  const user = await queryOne<{ id: string }>(
    `insert into users (email, email_normalised, full_name, password_hash, role, status, auth_providers)
     values ($1, $2, $3, $4, 'loan_officer', 'unverified', array['password']::text[])
     returning id`,
    [input.email.trim(), email, fullName, passwordHash],
  )
  if (!user) return fail('Could not create the account. Please try again.')

  await recordAttempt('signup', email, true, ctx.ipAddress)
  await recordAudit({
    actor: { id: user.id, email, role: null },
    action: 'user.signup',
    entityType: 'user',
    entityId: user.id,
    details: { method: 'password' },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  })

  const emailResult = await issueCode(user.id, fullName, email, 'email_verification')

  return { ok: true, data: { email, emailSent: emailResult.sent } }
}

// ---------------------------------------------------------------------------
// Verification codes
// ---------------------------------------------------------------------------

async function issueCode(
  userId: string,
  fullName: string,
  email: string,
  purpose: 'email_verification' | 'password_reset',
): Promise<{ sent: boolean; code: string }> {
  const code = generateCode()
  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60_000)

  await transaction(async (tx) => {
    // Issuing a new code invalidates the previous one. Otherwise a user who
    // clicks "resend" three times has three live codes, which triples the
    // brute-force surface for no benefit.
    await tx.query(
      `update verification_codes set consumed_at = now()
        where user_id = $1 and purpose = $2 and consumed_at is null`,
      [userId, purpose],
    )
    await tx.query(
      `insert into verification_codes (user_id, purpose, code_hash, expires_at, max_attempts)
       values ($1, $2, $3, $4, $5)`,
      [userId, purpose, hashCode(code), expiresAt, CODE_MAX_ATTEMPTS],
    )
  })

  const content =
    purpose === 'email_verification'
      ? verificationCodeEmail({ name: fullName, code, expiryMinutes: CODE_TTL_MINUTES })
      : passwordResetEmail({ name: fullName, code, expiryMinutes: CODE_TTL_MINUTES })

  const result = await sendEmail({
    to: email,
    template: purpose === 'email_verification' ? 'verification_code' : 'password_reset',
    content,
    userId,
  })

  return { sent: result.ok, code }
}

export async function resendVerificationCode(
  rawEmail: string,
  ctx: RequestContext,
): Promise<AuthResult<{ cooldownSeconds: number }>> {
  const email = normaliseEmail(rawEmail)

  const limit = await checkRateLimit('resend_code', email, ctx.ipAddress)
  if (!limit.allowed) {
    return fail(limit.reason ?? 'Too many attempts.', undefined, limit.retryAfterSeconds)
  }

  const user = await queryOne<{ id: string; full_name: string; status: string; email: string }>(
    'select id, full_name, status, email from users where email_normalised = $1',
    [email],
  )

  // Enforce the cooldown before doing anything else, so repeatedly hitting
  // resend cannot be used to flood someone's inbox.
  if (user) {
    const recent = await queryOne<{ created_at: Date }>(
      `select created_at from verification_codes
        where user_id = $1 and purpose = 'email_verification'
        order by created_at desc limit 1`,
      [user.id],
    )
    if (recent) {
      const elapsed = (Date.now() - recent.created_at.getTime()) / 1000
      if (elapsed < RESEND_COOLDOWN_SECONDS) {
        return fail(
          'Please wait a moment before requesting another code.',
          undefined,
          Math.ceil(RESEND_COOLDOWN_SECONDS - elapsed),
        )
      }
    }

    if (user.status === 'unverified') {
      await issueCode(user.id, user.full_name, user.email, 'email_verification')
    }
  }

  await recordAttempt('resend_code', email, true, ctx.ipAddress)
  // Same response whether or not the account exists.
  return { ok: true, data: { cooldownSeconds: RESEND_COOLDOWN_SECONDS } }
}

export async function verifyEmailCode(
  rawEmail: string,
  code: string,
  ctx: RequestContext,
): Promise<AuthResult<{ role: Role; landingPath: string }>> {
  const email = normaliseEmail(rawEmail)
  const cleaned = code.replace(/\D/g, '')

  if (cleaned.length !== 6) return fail('Enter the 6-digit code from your email.', 'code')

  const limit = await checkRateLimit('verify_code', email, ctx.ipAddress)
  if (!limit.allowed) {
    return fail(limit.reason ?? 'Too many attempts.', undefined, limit.retryAfterSeconds)
  }

  const user = await queryOne<{ id: string; full_name: string; status: string; role: Role; email: string }>(
    'select id, full_name, status, role, email from users where email_normalised = $1',
    [email],
  )
  if (!user) {
    await recordAttempt('verify_code', email, false, ctx.ipAddress)
    return fail('That code is not valid. Request a new one.', 'code')
  }

  if (user.status === 'active') {
    return fail('This email is already verified. You can sign in.', 'code')
  }
  if (user.status === 'suspended') {
    return fail('This account has been suspended. Contact your administrator.')
  }

  const record = await queryOne<{
    id: string
    code_hash: string
    expires_at: Date
    attempts: number
    max_attempts: number
  }>(
    `select id, code_hash, expires_at, attempts, max_attempts
       from verification_codes
      where user_id = $1 and purpose = 'email_verification' and consumed_at is null
      order by created_at desc limit 1`,
    [user.id],
  )

  if (!record) {
    await recordAttempt('verify_code', email, false, ctx.ipAddress)
    return fail('That code has expired. Request a new one.', 'code')
  }

  if (record.expires_at < new Date()) {
    await recordAttempt('verify_code', email, false, ctx.ipAddress)
    return fail('That code has expired. Request a new one.', 'code')
  }

  if (record.attempts >= record.max_attempts) {
    // Burn the code entirely rather than letting the attempt counter reset.
    await query('update verification_codes set consumed_at = now() where id = $1', [record.id])
    await recordAttempt('verify_code', email, false, ctx.ipAddress)
    return fail('Too many incorrect attempts. Request a new code.', 'code')
  }

  if (!codeMatches(cleaned, record.code_hash)) {
    await query('update verification_codes set attempts = attempts + 1 where id = $1', [record.id])
    await recordAttempt('verify_code', email, false, ctx.ipAddress)
    const left = record.max_attempts - record.attempts - 1
    return fail(
      left > 0
        ? `That code is not correct. ${left} ${left === 1 ? 'attempt' : 'attempts'} remaining.`
        : 'That code is not correct. Request a new one.',
      'code',
    )
  }

  // Correct. Activate the account and consume the code in one transaction, so
  // a crash between the two cannot leave a used code that still works.
  await transaction(async (tx) => {
    await tx.query('update verification_codes set consumed_at = now() where id = $1', [record.id])
    await tx.query(
      `update users set status = 'active', email_verified_at = now() where id = $1`,
      [user.id],
    )
  })

  await recordAttempt('verify_code', email, true, ctx.ipAddress)
  await recordAudit({
    actor: { id: user.id, email, role: user.role },
    action: 'user.email_verified',
    entityType: 'user',
    entityId: user.id,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  })

  await createSession({ userId: user.id, userAgent: ctx.userAgent, ipAddress: ctx.ipAddress })

  void sendEmail({
    to: user.email,
    template: 'welcome',
    userId: user.id,
    content: welcomeEmail({
      name: user.full_name,
      roleLabel: ROLE_DEFINITIONS[user.role].label,
      appUrl: APP_URL(),
    }),
  })

  return {
    ok: true,
    data: { role: user.role, landingPath: ROLE_DEFINITIONS[user.role].landingPath },
  }
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

export async function login(
  rawEmail: string,
  password: string,
  ctx: RequestContext,
): Promise<AuthResult<{ role: Role; landingPath: string; needsVerification?: boolean; email?: string }>> {
  const email = normaliseEmail(rawEmail)

  if (!email || !password) return fail('Enter your email and password.')

  const limit = await checkRateLimit('login', email, ctx.ipAddress)
  if (!limit.allowed) {
    return fail(limit.reason ?? 'Too many attempts.', undefined, limit.retryAfterSeconds)
  }

  const user = await queryOne<{
    id: string
    email: string
    full_name: string
    password_hash: string | null
    role: Role
    status: string
  }>(
    'select id, email, full_name, password_hash, role, status from users where email_normalised = $1',
    [email],
  )

  // verifyPassword runs bcrypt against a dummy hash when the user is missing,
  // so a non-existent account takes the same time as a wrong password.
  const passwordOk = await verifyPassword(password, user?.password_hash ?? null)

  if (!user || !passwordOk) {
    await recordAttempt('login', email, false, ctx.ipAddress)
    if (user) {
      await recordAudit({
        actor: { id: user.id, email, role: user.role },
        action: 'user.login_failed',
        entityType: 'user',
        entityId: user.id,
        details: { reason: 'bad_password' },
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      })
    }
    return fail('That email or password is not correct.')
  }

  if (user.status === 'unverified') {
    await recordAttempt('login', email, false, ctx.ipAddress)
    // Safe to reveal: they proved they hold the password.
    return {
      ok: true,
      data: {
        role: user.role,
        landingPath: '/verify',
        needsVerification: true,
        email: user.email,
      },
    }
  }

  if (user.status === 'suspended') {
    await recordAttempt('login', email, false, ctx.ipAddress)
    return fail('This account has been suspended. Contact your administrator.')
  }

  const newDevice = await isNewDevice(user.id, ctx.userAgent)

  await createSession({ userId: user.id, userAgent: ctx.userAgent, ipAddress: ctx.ipAddress })
  await recordAttempt('login', email, true, ctx.ipAddress)
  await recordAudit({
    actor: { id: user.id, email, role: user.role },
    action: 'user.login',
    entityType: 'user',
    entityId: user.id,
    details: { method: 'password', newDevice },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  })

  if (newDevice) {
    void sendEmail({
      to: user.email,
      template: 'new_login_alert',
      userId: user.id,
      content: newLoginAlertEmail({
        name: user.full_name,
        when: new Date(),
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
        appUrl: APP_URL(),
      }),
    })
  }

  return {
    ok: true,
    data: { role: user.role, landingPath: ROLE_DEFINITIONS[user.role].landingPath },
  }
}

// ---------------------------------------------------------------------------
// Password reset
// ---------------------------------------------------------------------------

export async function requestPasswordReset(
  rawEmail: string,
  ctx: RequestContext,
): Promise<AuthResult> {
  const email = normaliseEmail(rawEmail)

  const limit = await checkRateLimit('password_reset', email, ctx.ipAddress)
  if (!limit.allowed) {
    return fail(limit.reason ?? 'Too many attempts.', undefined, limit.retryAfterSeconds)
  }

  const user = await queryOne<{ id: string; full_name: string; email: string; status: string; role: Role }>(
    'select id, full_name, email, status, role from users where email_normalised = $1',
    [email],
  )

  if (user && user.status !== 'suspended') {
    await issueCode(user.id, user.full_name, user.email, 'password_reset')
    await recordAudit({
      actor: { id: user.id, email, role: user.role },
      action: 'user.password_reset_requested',
      entityType: 'user',
      entityId: user.id,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    })
  }

  await recordAttempt('password_reset', email, true, ctx.ipAddress)
  // Always the same answer — an attacker learns nothing about who is registered.
  return { ok: true }
}

export async function completePasswordReset(
  rawEmail: string,
  code: string,
  newPassword: string,
  ctx: RequestContext,
): Promise<AuthResult> {
  const email = normaliseEmail(rawEmail)
  const cleaned = code.replace(/\D/g, '')

  if (cleaned.length !== 6) return fail('Enter the 6-digit code from your email.', 'code')

  const limit = await checkRateLimit('verify_code', email, ctx.ipAddress)
  if (!limit.allowed) {
    return fail(limit.reason ?? 'Too many attempts.', undefined, limit.retryAfterSeconds)
  }

  const user = await queryOne<{ id: string; full_name: string; role: Role; status: string }>(
    'select id, full_name, role, status from users where email_normalised = $1',
    [email],
  )
  if (!user) {
    await recordAttempt('verify_code', email, false, ctx.ipAddress)
    return fail('That code is not valid. Request a new one.', 'code')
  }

  const strength = checkPasswordStrength(newPassword, { email, name: user.full_name })
  if (!strength.valid) return fail(strength.problems[0], 'password')

  const record = await queryOne<{
    id: string
    code_hash: string
    expires_at: Date
    attempts: number
    max_attempts: number
  }>(
    `select id, code_hash, expires_at, attempts, max_attempts
       from verification_codes
      where user_id = $1 and purpose = 'password_reset' and consumed_at is null
      order by created_at desc limit 1`,
    [user.id],
  )

  if (!record || record.expires_at < new Date()) {
    await recordAttempt('verify_code', email, false, ctx.ipAddress)
    return fail('That code has expired. Request a new one.', 'code')
  }

  if (record.attempts >= record.max_attempts) {
    await query('update verification_codes set consumed_at = now() where id = $1', [record.id])
    await recordAttempt('verify_code', email, false, ctx.ipAddress)
    return fail('Too many incorrect attempts. Request a new code.', 'code')
  }

  if (!codeMatches(cleaned, record.code_hash)) {
    await query('update verification_codes set attempts = attempts + 1 where id = $1', [record.id])
    await recordAttempt('verify_code', email, false, ctx.ipAddress)
    const left = record.max_attempts - record.attempts - 1
    return fail(
      left > 0 ? `That code is not correct. ${left} remaining.` : 'That code is not correct.',
      'code',
    )
  }

  const passwordHash = await hashPassword(newPassword)

  await transaction(async (tx) => {
    await tx.query('update verification_codes set consumed_at = now() where id = $1', [record.id])
    await tx.query(
      `update users
          set password_hash = $2,
              -- A reset also verifies the address: they proved they can read
              -- mail sent to it.
              status = case when status = 'unverified' then 'active' else status end,
              email_verified_at = coalesce(email_verified_at, now()),
              auth_providers = case
                when 'password' = any(auth_providers) then auth_providers
                else array_append(auth_providers, 'password')
              end
        where id = $1`,
      [user.id, passwordHash],
    )
  })

  // Every existing session dies. If the reset was triggered because someone
  // else had access, leaving their session alive would defeat the point.
  await revokeAllSessions(user.id)

  await recordAttempt('verify_code', email, true, ctx.ipAddress)
  await recordAudit({
    actor: { id: user.id, email, role: user.role },
    action: 'user.password_reset_completed',
    entityType: 'user',
    entityId: user.id,
    details: { sessionsRevoked: true },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  })

  return { ok: true }
}

// ---------------------------------------------------------------------------
// Change password (signed in)
// ---------------------------------------------------------------------------

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  ctx: RequestContext,
): Promise<AuthResult> {
  const user = await queryOne<{
    id: string
    email: string
    full_name: string
    password_hash: string | null
    role: Role
  }>('select id, email, full_name, password_hash, role from users where id = $1', [userId])

  if (!user) return fail('Account not found.')

  // A Google-only account has no password to confirm; it sets one instead.
  if (user.password_hash) {
    const ok = await verifyPassword(currentPassword, user.password_hash)
    if (!ok) return fail('Your current password is not correct.', 'currentPassword')
  }

  const strength = checkPasswordStrength(newPassword, { email: user.email, name: user.full_name })
  if (!strength.valid) return fail(strength.problems[0], 'newPassword')

  const passwordHash = await hashPassword(newPassword)
  await query(
    `update users
        set password_hash = $2,
            auth_providers = case
              when 'password' = any(auth_providers) then auth_providers
              else array_append(auth_providers, 'password')
            end
      where id = $1`,
    [userId, passwordHash],
  )

  await revokeAllSessions(userId)
  await recordAudit({
    actor: { id: user.id, email: user.email, role: user.role },
    action: 'user.password_reset_completed',
    entityType: 'user',
    entityId: user.id,
    details: { method: 'settings_change', sessionsRevoked: true },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  })

  // The caller re-issues a session so the user is not signed out of the tab
  // they just changed their password in.
  await createSession({ userId, userAgent: ctx.userAgent, ipAddress: ctx.ipAddress })

  return { ok: true }
}
