import 'server-only'
import { createHash, randomBytes } from 'node:crypto'
import { query, queryOne } from '@/lib/db/client'
import { recordAudit } from './audit'
import { normaliseEmail } from './password'
import { ROLE_DEFINITIONS, type Role } from './roles'
import { createSession } from './session'
import type { RequestContext } from './service'

/**
 * "Continue with Google", implemented directly against Google's endpoints.
 *
 * No NextAuth: the whole point of building our own auth is that the role model
 * is lending-specific, and adding an adapter layer to translate between it and
 * a generic session abstraction would be more work than the ~150 lines here.
 *
 * The flow is the OAuth 2.0 authorization-code grant with PKCE, and both
 * protections matter:
 *
 *   `state` is a single-use random value we store and check on the way back.
 *   Without it, an attacker can complete a flow in a victim's browser and end
 *   up with their own Google account linked to the victim's session.
 *
 *   PKCE binds the authorization code to this specific browser. Even if the
 *   code leaks — through a referrer header, a log, a shared device — it cannot
 *   be exchanged without the verifier, which never leaves our server.
 */

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo'

const STATE_TTL_MINUTES = 10

export function isGoogleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
}

export function googleRedirectUri(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ?? 'http://localhost:3000'
  return `${base}/api/auth/google/callback`
}

function base64url(buffer: Buffer): string {
  return buffer.toString('base64url')
}

/**
 * Start the flow: mint state + PKCE verifier, store them, return the URL to
 * send the browser to.
 */
export async function beginGoogleAuth(redirectTo?: string): Promise<string> {
  if (!isGoogleConfigured()) {
    throw new Error('Google sign-in is not configured (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).')
  }

  const state = base64url(randomBytes(24))
  const codeVerifier = base64url(randomBytes(48))
  // S256: Google only ever sees the hash, so an intercepted challenge is useless.
  const codeChallenge = base64url(createHash('sha256').update(codeVerifier).digest())

  await query(
    `insert into oauth_states (state, code_verifier, redirect_to, expires_at)
     values ($1, $2, $3, now() + ($4 || ' minutes')::interval)`,
    [state, codeVerifier, sanitiseRedirect(redirectTo), String(STATE_TTL_MINUTES)],
  )

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: googleRedirectUri(),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    // Always show the picker: on a shared machine, silently reusing whichever
    // Google account is already signed in is a real way to end up in the wrong
    // person's lending dashboard.
    prompt: 'select_account',
  })

  return `${GOOGLE_AUTH_URL}?${params.toString()}`
}

/**
 * Only same-origin paths are allowed as a post-login destination. Accepting an
 * absolute URL here would turn the login page into an open redirect — a
 * standard phishing primitive.
 */
function sanitiseRedirect(redirectTo?: string): string | null {
  if (!redirectTo) return null
  if (!redirectTo.startsWith('/') || redirectTo.startsWith('//')) return null
  return redirectTo.slice(0, 500)
}

interface GoogleProfile {
  sub: string
  email: string
  email_verified: boolean
  name?: string
  given_name?: string
  picture?: string
}

export type GoogleCallbackResult =
  | { ok: true; landingPath: string; isNewUser: boolean }
  | { ok: false; error: string }

/** Complete the flow: validate state, exchange the code, sign the user in. */
export async function completeGoogleAuth(
  code: string,
  state: string,
  ctx: RequestContext,
): Promise<GoogleCallbackResult> {
  if (!isGoogleConfigured()) {
    return { ok: false, error: 'Google sign-in is not configured.' }
  }

  // Consume the state atomically. `consumed_at is null` in the WHERE clause is
  // what makes it single-use even if the callback is replayed concurrently.
  const stored = await queryOne<{ code_verifier: string; redirect_to: string | null }>(
    `update oauth_states
        set consumed_at = now()
      where state = $1 and consumed_at is null and expires_at > now()
      returning code_verifier, redirect_to`,
    [state],
  )

  if (!stored) {
    return {
      ok: false,
      error: 'That sign-in link has expired or was already used. Please try again.',
    }
  }

  let profile: GoogleProfile
  try {
    profile = await exchangeCodeForProfile(code, stored.code_verifier)
  } catch (err) {
    console.error('[google] token exchange failed:', err)
    return { ok: false, error: 'Could not complete Google sign-in. Please try again.' }
  }

  if (!profile.email) {
    return { ok: false, error: 'Google did not return an email address for that account.' }
  }
  if (!profile.email_verified) {
    // Trusting an unverified Google address would let someone claim an email
    // they do not control — which is exactly the check our own code flow makes.
    return {
      ok: false,
      error: 'That Google account has an unverified email address. Verify it with Google first.',
    }
  }

  const email = normaliseEmail(profile.email)
  const fullName = profile.name?.trim() || profile.given_name?.trim() || email.split('@')[0]

  const existing = await queryOne<{
    id: string
    role: Role
    status: string
    google_sub: string | null
    avatar_url: string | null
  }>(
    `select id, role, status, google_sub, avatar_url
       from users
      where google_sub = $1 or email_normalised = $2
      limit 1`,
    [profile.sub, email],
  )

  if (existing) {
    if (existing.status === 'suspended') {
      return { ok: false, error: 'This account has been suspended. Contact your administrator.' }
    }

    // Account linking: the email already exists as a password account, so
    // attach the provider rather than creating a duplicate person. Safe
    // because Google has verified the address.
    await query(
      `update users
          set google_sub = coalesce(google_sub, $2),
              avatar_url = coalesce(avatar_url, $3),
              -- Google has verified the address, so this also completes an
              -- outstanding email verification.
              status = case when status = 'unverified' then 'active' else status end,
              email_verified_at = coalesce(email_verified_at, now()),
              auth_providers = case
                when 'google' = any(auth_providers) then auth_providers
                else array_append(auth_providers, 'google')
              end
        where id = $1`,
      [existing.id, profile.sub, profile.picture ?? null],
    )

    await createSession({ userId: existing.id, userAgent: ctx.userAgent, ipAddress: ctx.ipAddress })
    await recordAudit({
      actor: { id: existing.id, email, role: existing.role },
      action: existing.google_sub ? 'user.login' : 'user.google_linked',
      entityType: 'user',
      entityId: existing.id,
      details: { method: 'google' },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    })

    return {
      ok: true,
      isNewUser: false,
      landingPath: stored.redirect_to ?? ROLE_DEFINITIONS[existing.role].landingPath,
    }
  }

  // New account. No password hash and no verification code: Google has already
  // proved they control the address, so making them type a six-digit code
  // would be theatre.
  const created = await queryOne<{ id: string; role: Role }>(
    `insert into users
       (email, email_normalised, full_name, avatar_url, role, status,
        email_verified_at, google_sub, auth_providers)
     values ($1, $2, $3, $4, 'loan_officer', 'active', now(), $5, array['google']::text[])
     returning id, role`,
    [profile.email.trim(), email, fullName, profile.picture ?? null, profile.sub],
  )
  if (!created) return { ok: false, error: 'Could not create the account. Please try again.' }

  await createSession({ userId: created.id, userAgent: ctx.userAgent, ipAddress: ctx.ipAddress })
  await recordAudit({
    actor: { id: created.id, email, role: created.role },
    action: 'user.google_signup',
    entityType: 'user',
    entityId: created.id,
    details: { method: 'google' },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  })

  return {
    ok: true,
    isNewUser: true,
    landingPath: stored.redirect_to ?? ROLE_DEFINITIONS[created.role].landingPath,
  }
}

async function exchangeCodeForProfile(code: string, codeVerifier: string): Promise<GoogleProfile> {
  const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: googleRedirectUri(),
      grant_type: 'authorization_code',
      code_verifier: codeVerifier,
    }),
  })

  if (!tokenResponse.ok) {
    const body = await tokenResponse.text()
    // `redirect_uri_mismatch` is by far the most common failure here, and
    // Google's own error text does not say which URI it expected.
    throw new Error(
      `Google token exchange failed (${tokenResponse.status}): ${body}. ` +
        `Check that "${googleRedirectUri()}" is registered as an authorized redirect URI.`,
    )
  }

  const tokens = (await tokenResponse.json()) as { access_token?: string }
  if (!tokens.access_token) throw new Error('Google did not return an access token.')

  const profileResponse = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  })
  if (!profileResponse.ok) {
    throw new Error(`Could not read the Google profile (${profileResponse.status}).`)
  }

  return (await profileResponse.json()) as GoogleProfile
}
