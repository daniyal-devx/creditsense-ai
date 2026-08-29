import { jwtVerify } from 'jose'
import type { Role } from './roles'

/**
 * The Edge-safe slice of session handling.
 *
 * Middleware runs on the Edge runtime, which has no Node built-ins and cannot
 * load `pg`. So this module deliberately imports nothing but `jose`: it
 * verifies the JWT signature and nothing else.
 *
 * That is enough to decide "send this request to /login or let it through",
 * and it keeps middleware fast — no database round trip on every navigation.
 *
 * It is NOT enough to release applicant data. A session can be revoked after
 * its token was issued, and only the `sessions` row knows that. Anything that
 * actually reads customer records calls `getSession()` from `session.ts`,
 * which checks the row. Middleware is a routing convenience; the server-side
 * permission check is the access control.
 */

export const SESSION_COOKIE = 'creditsense_session'

export interface EdgeClaims {
  userId: string
  sessionId: string
  role: Role
}

export async function verifyJwtEdge(token: string, secret: string): Promise<EdgeClaims | null> {
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
      issuer: 'creditsense',
      audience: 'creditsense-dashboard',
    })
    if (!payload.sub || typeof payload.sid !== 'string' || typeof payload.role !== 'string') {
      return null
    }
    return {
      userId: payload.sub,
      sessionId: payload.sid,
      role: payload.role as Role,
    }
  } catch {
    // Expired, tampered with, or signed with a different secret.
    return null
  }
}
