import 'server-only'
import { redirect } from 'next/navigation'
import { NextResponse } from 'next/server'
import { can, canAny, type Permission } from './roles'
import { getSession, type SessionContext, type SessionUser } from './session'

/**
 * Server-side permission checks.
 *
 * This is where access control actually happens. Middleware routes people, and
 * the navigation hides links a role cannot use — but neither is a control. A
 * user can type a URL, and anyone can curl an API route directly. Every page
 * and every handler that touches applicant data calls one of these first.
 *
 * The pattern is deliberately hard to skip: these functions return the user,
 * so the natural way to write a handler is
 *
 *     const user = await requirePermission('applications:decide')
 *
 * rather than fetching data and remembering to check afterwards.
 */

/** The signed-in user, or redirect to /login. For pages. */
export async function requireUser(): Promise<SessionUser> {
  const session = await getSession()
  if (!session) redirect('/login?error=session_expired')
  return session.user
}

/** The full session (including the session id), or redirect. */
export async function requireSession(): Promise<SessionContext> {
  const session = await getSession()
  if (!session) redirect('/login?error=session_expired')
  return session
}

/**
 * Require a permission, or redirect to a page explaining why not.
 *
 * Redirecting rather than 404ing is deliberate: the user is legitimately
 * signed in and has simply hit an area their role does not cover. Telling them
 * that, and naming the role that does, is far more useful than pretending the
 * page does not exist.
 */
export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const user = await requireUser()
  if (!can(user.role, permission)) {
    redirect(`/no-access?permission=${encodeURIComponent(permission)}`)
  }
  return user
}

/** Require at least one of several permissions. */
export async function requireAnyPermission(permissions: Permission[]): Promise<SessionUser> {
  const user = await requireUser()
  if (!canAny(user.role, permissions)) {
    redirect(`/no-access?permission=${encodeURIComponent(permissions[0])}`)
  }
  return user
}

// ---------------------------------------------------------------------------
// API route equivalents
// ---------------------------------------------------------------------------

export type ApiGuardResult =
  | { ok: true; user: SessionUser; session: SessionContext }
  | { ok: false; response: NextResponse }

/**
 * The API-route form. Returns a response to hand straight back rather than
 * redirecting, because an API client wants a status code, not HTML.
 *
 * 401 means "you are not signed in"; 403 means "you are, but not allowed".
 * Collapsing them into one code makes a client unable to tell whether to
 * prompt for login or show an error.
 */
export async function guardApi(permission?: Permission): Promise<ApiGuardResult> {
  const session = await getSession()

  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'You are not signed in.' }, { status: 401 }),
    }
  }

  if (permission && !can(session.user.role, permission)) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: 'Your role does not allow this action.',
          requiredPermission: permission,
        },
        { status: 403 },
      ),
    }
  }

  return { ok: true, user: session.user, session }
}
