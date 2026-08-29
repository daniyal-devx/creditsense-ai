import { NextResponse } from 'next/server'
import { z } from 'zod'
import { guardApi } from '@/lib/auth/guard'
import { jsonError, parseBody, requestContext } from '@/lib/auth/http'
import { ROLES } from '@/lib/auth/roles'
import { changeUserRole, reactivateUser, suspendUser } from '@/lib/db/users'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('change_role'), role: z.enum(ROLES) }),
  z.object({ action: z.literal('suspend') }),
  z.object({ action: z.literal('reactivate') }),
])

/**
 * PATCH /api/admin/users/[id]
 *
 * Role changes and suspensions. Guarded by `users:manage` on the server —
 * hiding the admin nav item from other roles is a convenience, not a control.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await guardApi('users:manage')
  if (!guard.ok) return guard.response

  const { id } = await params
  const body = await parseBody(request, schema)
  if (!body.ok) return body.response

  const actor = { id: guard.user.id, email: guard.user.email, role: guard.user.role }
  const ctx = requestContext(request)

  const result =
    body.data.action === 'change_role'
      ? await changeUserRole(id, body.data.role, actor, ctx)
      : body.data.action === 'suspend'
        ? await suspendUser(id, actor, ctx)
        : await reactivateUser(id, actor, ctx)

  if (!result.ok) return jsonError(result.error, 400)

  return NextResponse.json({ ok: true })
}
