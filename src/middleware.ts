import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE, verifyJwtEdge } from '@/lib/auth/edge'

/**
 * Route protection.
 *
 * This is the *first* of two checks, not the only one. It verifies the session
 * JWT's signature — enough to bounce an anonymous visitor to /login without a
 * database round trip on every navigation — and then every server component
 * and API route re-checks the session row and the role permissions before
 * touching applicant data.
 *
 * Doing it only here would be a real vulnerability: middleware cannot see
 * whether a session was revoked, and it does not know which role may read
 * which record. Hiding a route is not access control.
 */

/** Reachable without a session. */
const PUBLIC_PATHS = [
  '/login',
  '/signup',
  '/verify',
  '/forgot-password',
  '/reset-password',
]

/** API routes that must stay open — they are how you get a session. */
const PUBLIC_API_PREFIXES = [
  '/api/auth/login',
  '/api/auth/signup',
  '/api/auth/verify',
  '/api/auth/resend',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/auth/logout',
  '/api/auth/google',
  '/api/health',
]

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return true
  if (PUBLIC_API_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return true
  return false
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl

  const secret = process.env.JWT_SECRET
  // Without a secret nothing can be verified. Rather than silently letting
  // every request through, fail closed — except on the auth pages themselves,
  // so the deployment is still diagnosable rather than a redirect loop.
  if (!secret || secret.length < 32) {
    if (isPublic(pathname)) return NextResponse.next()
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('error', 'not_configured')
    return NextResponse.redirect(url)
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value
  const claims = token ? await verifyJwtEdge(token, secret) : null

  // Already signed in and heading for a sign-in page: send them onward rather
  // than showing a login form to someone who is logged in.
  if (claims && (pathname === '/login' || pathname === '/signup')) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    url.search = ''
    return NextResponse.redirect(url)
  }

  if (isPublic(pathname)) return NextResponse.next()

  if (!claims) {
    // An API caller gets a 401 it can act on; a browser gets a redirect that
    // remembers where it was going.
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'You are not signed in.' }, { status: 401 })
    }
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    // Only the path, never an absolute URL — accepting one here would make
    // the login page an open redirect.
    if (pathname !== '/' && pathname !== '/dashboard') {
      url.searchParams.set('redirectTo', `${pathname}${search}`)
    }
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  /**
   * Everything except static assets and the favicon. Running middleware on
   * every image and font would add latency to assets that carry no session.
   */
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
}
