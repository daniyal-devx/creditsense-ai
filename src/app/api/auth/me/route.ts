import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { ROLE_DEFINITIONS } from '@/lib/auth/roles'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/auth/me
 *
 * The signed-in user, for client components that need it without a prop
 * drill. Returns only what the UI renders — never the password hash, the
 * session token, or anything else the browser has no business holding.
 */
export async function GET() {
  const session = await getSession()

  if (!session) {
    return NextResponse.json({ user: null }, { status: 401 })
  }

  const role = ROLE_DEFINITIONS[session.user.role]

  return NextResponse.json({
    user: {
      id: session.user.id,
      email: session.user.email,
      fullName: session.user.fullName,
      avatarUrl: session.user.avatarUrl,
      role: session.user.role,
      roleLabel: role.label,
      permissions: role.permissions,
    },
    expiresAt: session.expiresAt,
  })
}
