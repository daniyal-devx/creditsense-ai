import { z } from 'zod'
import { codeSchema, emailSchema, parseBody, requestContext, toResponse } from '@/lib/auth/http'
import { verifyEmailCode } from '@/lib/auth/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  email: emailSchema,
  code: codeSchema,
})

/**
 * POST /api/auth/verify
 *
 * Verifies the emailed 6-digit code and, on success, activates the account and
 * issues a session — so the user lands on their dashboard rather than being
 * bounced back to a login form they have already effectively passed.
 */
export async function POST(request: Request) {
  const body = await parseBody(request, schema)
  if (!body.ok) return body.response

  const result = await verifyEmailCode(body.data.email, body.data.code, requestContext(request))
  return toResponse(result)
}
