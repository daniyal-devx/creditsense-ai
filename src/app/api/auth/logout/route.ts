import { NextResponse } from 'next/server'
import { recordAudit } from '@/lib/auth/audit'
import { requestContext } from '@/lib/auth/http'
import { destroySession, getSession } from '@/lib/auth/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/auth/logout
 *
 * POST, not GET: a GET logout can be triggered by any page that embeds an
 * image pointing at it, which is a trivial denial-of-service against a user
 * mid-decision.
 *
 * Always returns 200. Logging out of an already-dead session is a success
 * from the caller's point of view.
 */
export async function POST(request: Request) {
  const session = await getSession()

  if (session) {
    await recordAudit({
      actor: { id: session.user.id, email: session.user.email, role: session.user.role },
      action: 'user.logout',
      entityType: 'user',
      entityId: session.user.id,
      ...requestContext(request),
    })
  }

  await destroySession()
  return NextResponse.json({ ok: true })
}
