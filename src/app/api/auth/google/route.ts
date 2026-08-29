import { NextResponse } from 'next/server'
import { beginGoogleAuth, isGoogleConfigured } from '@/lib/auth/google'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/auth/google
 *
 * Starts the OAuth flow and redirects to Google. A GET is correct here: it is
 * a navigation, not a state change — the state row it writes is a nonce, not
 * user data.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const redirectTo = url.searchParams.get('redirectTo') ?? undefined

  if (!isGoogleConfigured()) {
    return NextResponse.redirect(
      new URL('/login?error=google_not_configured', url.origin),
    )
  }

  try {
    const authUrl = await beginGoogleAuth(redirectTo)
    return NextResponse.redirect(authUrl)
  } catch (err) {
    console.error('[google] could not start the flow:', err)
    return NextResponse.redirect(new URL('/login?error=google_failed', url.origin))
  }
}
