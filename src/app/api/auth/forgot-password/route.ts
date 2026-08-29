import { z } from 'zod'
import { emailSchema, parseBody, requestContext, toResponse } from '@/lib/auth/http'
import { requestPasswordReset } from '@/lib/auth/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({ email: emailSchema })

/**
 * POST /api/auth/forgot-password
 *
 * Always returns ok:true. Responding differently for a registered address
 * would turn this endpoint into an account-enumeration oracle.
 */
export async function POST(request: Request) {
  const body = await parseBody(request, schema)
  if (!body.ok) return body.response

  const result = await requestPasswordReset(body.data.email, requestContext(request))
  return toResponse(result)
}
