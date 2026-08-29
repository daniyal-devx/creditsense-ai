import { NextResponse } from 'next/server'
import { completeGoogleAuth } from '@/lib/auth/google'
import { requestContext } from '@/lib/auth/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/auth/google/callback
 *
 * Where Google sends the browser back. Every failure path redirects to /login
 * with a short error key rather than rendering a raw message: the query string
 * ends up in browser history and server logs, so it must not carry anything
 * an attacker could use or a user could be socially engineered with.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')

  // The user pressed "Cancel" on Google's consent screen. Not an error.
  if (error === 'access_denied') {
    return NextResponse.redirect(new URL('/login', url.origin))
  }
  if (error) {
    console.error('[google] callback returned an error:', error)
    return NextResponse.redirect(new URL('/login?error=google_failed', url.origin))
  }
  if (!code || !state) {
    return NextResponse.redirect(new URL('/login?error=google_failed', url.origin))
  }

  const result = await completeGoogleAuth(code, state, requestContext(request))

  if (!result.ok) {
    console.error('[google] sign-in failed:', result.error)
    return NextResponse.redirect(new URL('/login?error=google_failed', url.origin))
  }

  return NextResponse.redirect(new URL(result.landingPath, url.origin))
}
