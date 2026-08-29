import { z } from 'zod'
import {
  codeSchema,
  emailSchema,
  parseBody,
  passwordSchema,
  requestContext,
  toResponse,
} from '@/lib/auth/http'
import { completePasswordReset } from '@/lib/auth/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  email: emailSchema,
  code: codeSchema,
  password: passwordSchema,
})

/**
 * POST /api/auth/reset-password
 *
 * Completing a reset revokes every existing session. If the reset happened
 * because someone else had access to the account, leaving their session alive
 * would defeat the entire point.
 */
export async function POST(request: Request) {
  const body = await parseBody(request, schema)
  if (!body.ok) return body.response

  const result = await completePasswordReset(
    body.data.email,
    body.data.code,
    body.data.password,
    requestContext(request),
  )
  return toResponse(result)
}
