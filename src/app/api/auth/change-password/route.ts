import { z } from 'zod'
import { jsonError, parseBody, passwordSchema, requestContext, toResponse } from '@/lib/auth/http'
import { changePassword } from '@/lib/auth/service'
import { getSession } from '@/lib/auth/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  currentPassword: z.string().max(200).optional().default(''),
  newPassword: passwordSchema,
})

/**
 * POST /api/auth/change-password
 *
 * Signed-in password change. Revokes every other session, then issues a fresh
 * one for this device so the user is not signed out of the tab they are in.
 */
export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return jsonError('You are not signed in.', 401)

  const body = await parseBody(request, schema)
  if (!body.ok) return body.response

  const result = await changePassword(
    session.user.id,
    body.data.currentPassword,
    body.data.newPassword,
    requestContext(request),
  )
  return toResponse(result)
}
