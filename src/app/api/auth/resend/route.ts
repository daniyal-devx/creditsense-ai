import { z } from 'zod'
import { emailSchema, parseBody, requestContext, toResponse } from '@/lib/auth/http'
import { resendVerificationCode } from '@/lib/auth/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({ email: emailSchema })

/**
 * POST /api/auth/resend
 *
 * Rate limited and subject to a 60-second cooldown, so this cannot be used to
 * flood somebody's inbox. Issuing a new code invalidates the previous one.
 */
export async function POST(request: Request) {
  const body = await parseBody(request, schema)
  if (!body.ok) return body.response

  const result = await resendVerificationCode(body.data.email, requestContext(request))
  return toResponse(result)
}
