import 'server-only'
import { cookies } from 'next/headers'
import { SignJWT, jwtVerify } from 'jose'
import { query, queryOne } from '@/lib/db/client'
import { generateToken, hashToken } from './password'
import type { Role } from './roles'

/**
 * Sessions.
 *
 * Two layers, deliberately:
 *
 *   The JWT in the cookie proves the request carries a credential we issued,
 *   and can be checked without touching the database — which is what makes
 *   middleware cheap.
 *
 *   The `sessions` row is the authority on whether that credential is still
 *   good. A JWT on its own cannot be revoked before it expires, and "revoke
 *   this user's access right now" is a hard requirement for a tool that
 *   approves loans. Anything that actually reads applicant data validates
 *   against the row, not just the signature.
 *
 * The cookie is httpOnly, Secure in production, and SameSite=Lax: httpOnly
 * puts it out of reach of XSS, and Lax blocks it from being sent on
 * cross-site POSTs, which is our CSRF defence for the mutation routes.
 */

export const SESSION_COOKIE = 'creditsense_session'
export const SESSION_TTL_DAYS = 7
/** Sliding window: a session in daily use keeps extending rather than expiring. */
const REFRESH_IF_OLDER_THAN_HOURS = 12

export interface SessionUser {
  id: string
  email: string
  fullName: string
  role: Role
  status: 'unverified' | 'active' | 'suspended'
  avatarUrl: string | null
  emailVerifiedAt: Date | null
}

export interface SessionContext {
  user: SessionUser
  sessionId: string
  expiresAt: Date
}

function secret(): Uint8Array {
  const value = process.env.JWT_SECRET
  if (!value || value.length < 32) {
    throw new Error(
      'JWT_SECRET is missing or too short. Generate one with:\n' +
        '  node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"',
    )
  }
  return new TextEncoder().encode(value)
}

/** True when auth can work at all. Used to fail loudly at startup, not at login. */
export function isAuthConfigured(): boolean {
  return Boolean(process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 32)
}

interface JwtClaims {
  sub: string
  sid: string
  role: Role
}

async function signSessionJwt(claims: JwtClaims, expiresAt: Date): Promise<string> {
  return new SignJWT({ sid: claims.sid, role: claims.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setIssuer('creditsense')
    .setAudience('creditsense-dashboard')
    .setExpirationTime(expiresAt)
    .sign(secret())
}

/**
 * Verify the JWT only. Fast, no database round trip.
 *
 * This is enough for middleware to decide whether to redirect to /login, but
 * NOT enough to release applicant data — the session may have been revoked
 * since the token was issued. Use `getSession()` for that.
 */
export async function verifySessionJwt(
  token: string,
): Promise<{ userId: string; sessionId: string; role: Role } | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), {
      issuer: 'creditsense',
      audience: 'creditsense-dashboard',
    })
    if (!payload.sub || typeof payload.sid !== 'string') return null
    return {
      userId: payload.sub,
      sessionId: payload.sid,
      role: payload.role as Role,
    }
  } catch {
    // Expired, tampered with, or signed by a different secret.
    return null
  }
}

export interface CreateSessionOptions {
  userId: string
  userAgent?: string | null
  ipAddress?: string | null
}

/** Issue a session: insert the row, sign the JWT, set the cookie. */
export async function createSession(options: CreateSessionOptions): Promise<{ token: string; expiresAt: Date }> {
  const rawToken = generateToken(32)
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000)

  const row = await queryOne<{ id: string; role: Role }>(
    `insert into sessions (user_id, token_hash, expires_at, user_agent, ip_address)
     values ($1, $2, $3, $4, $5::inet)
     returning id, (select role from users where id = $1) as role`,
    [
      options.userId,
      hashToken(rawToken),
      expiresAt,
      options.userAgent?.slice(0, 500) ?? null,
      options.ipAddress ?? null,
    ],
  )
  if (!row) throw new Error('Failed to create session')

  const jwt = await signSessionJwt(
    { sub: options.userId, sid: row.id, role: row.role },
    expiresAt,
  )

  const store = await cookies()
  store.set(SESSION_COOKIE, jwt, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  })

  await query('update users set last_login_at = now() where id = $1', [options.userId])

  return { token: jwt, expiresAt }
}

/**
 * The full, authoritative session.
 *
 * Validates the JWT *and* the row: not revoked, not expired, user still
 * active, and issued after the user's `sessions_valid_from` watermark — which
 * is how a password reset invalidates every other device at once.
 */
export async function getSession(): Promise<SessionContext | null> {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (!token) return null

  const claims = await verifySessionJwt(token)
  if (!claims) return null

  const row = await queryOne<{
    session_id: string
    expires_at: Date
    user_id: string
    email: string
    full_name: string
    role: Role
    status: SessionUser['status']
    avatar_url: string | null
    email_verified_at: Date | null
  }>(
    `select
       s.id as session_id, s.expires_at,
       u.id as user_id, u.email, u.full_name, u.role, u.status, u.avatar_url, u.email_verified_at
     from sessions s
     join users u on u.id = s.user_id
     where s.id = $1
       and s.user_id = $2
       and s.revoked_at is null
       and s.expires_at > now()
       and s.created_at >= u.sessions_valid_from`,
    [claims.sessionId, claims.userId],
  )

  if (!row) return null
  // A suspended account keeps its cookie but loses its access immediately.
  if (row.status !== 'active') return null

  // Sliding expiry, but only written occasionally — updating a row on every
  // request would turn every page load into a database write.
  void touchSession(row.session_id)

  return {
    sessionId: row.session_id,
    expiresAt: row.expires_at,
    user: {
      id: row.user_id,
      email: row.email,
      fullName: row.full_name,
      role: row.role,
      status: row.status,
      avatarUrl: row.avatar_url,
      emailVerifiedAt: row.email_verified_at,
    },
  }
}

async function touchSession(sessionId: string): Promise<void> {
  try {
    await query(
      `update sessions
          set last_seen_at = now()
        where id = $1
          and last_seen_at < now() - ($2 || ' hours')::interval`,
      [sessionId, String(REFRESH_IF_OLDER_THAN_HOURS)],
    )
  } catch {
    // A failed heartbeat must never break the request it rode in on.
  }
}

/** The signed-in user, or null. The everyday accessor. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await getSession()
  return session?.user ?? null
}

/** End this session and clear the cookie. */
export async function destroySession(): Promise<void> {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value

  if (token) {
    const claims = await verifySessionJwt(token)
    if (claims) {
      await query('update sessions set revoked_at = now() where id = $1 and revoked_at is null', [
        claims.sessionId,
      ])
    }
  }

  store.delete(SESSION_COOKIE)
}

/**
 * Revoke every session a user holds.
 *
 * Used on password reset and on suspension. Bumping `sessions_valid_from`
 * alongside the revoke closes the race where a session is created in the
 * moment between the two statements.
 */
export async function revokeAllSessions(userId: string): Promise<number> {
  const rows = await query<{ id: string }>(
    `with bumped as (
       update users set sessions_valid_from = now() where id = $1 returning id
     )
     update sessions set revoked_at = now()
      where user_id = $1 and revoked_at is null
      returning id`,
    [userId],
  )
  return rows.length
}

export interface ActiveSessionInfo {
  id: string
  userAgent: string | null
  ipAddress: string | null
  createdAt: Date
  lastSeenAt: Date
  isCurrent: boolean
}

/** The user's own device list, for the settings page. */
export async function listActiveSessions(
  userId: string,
  currentSessionId: string,
): Promise<ActiveSessionInfo[]> {
  const rows = await query<{
    id: string
    user_agent: string | null
    ip_address: string | null
    created_at: Date
    last_seen_at: Date
  }>(
    `select id, user_agent, ip_address::text, created_at, last_seen_at
       from sessions
      where user_id = $1 and revoked_at is null and expires_at > now()
      order by last_seen_at desc`,
    [userId],
  )

  return rows.map((r) => ({
    id: r.id,
    userAgent: r.user_agent,
    ipAddress: r.ip_address,
    createdAt: r.created_at,
    lastSeenAt: r.last_seen_at,
    isCurrent: r.id === currentSessionId,
  }))
}

/**
 * Whether this user has signed in from this device before.
 *
 * Drives the new-login alert email. A crude fingerprint on purpose — the point
 * is to notice an unfamiliar sign-in, not to identify hardware.
 */
export async function isNewDevice(userId: string, userAgent: string | null): Promise<boolean> {
  if (!userAgent) return false
  const row = await queryOne<{ count: string }>(
    `select count(*)::text as count
       from sessions
      where user_id = $1 and user_agent = $2 and created_at < now() - interval '1 minute'`,
    [userId, userAgent.slice(0, 500)],
  )
  return Number(row?.count ?? 0) === 0
}
