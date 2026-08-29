import { z } from 'zod'
import { emailSchema, parseBody, passwordSchema, requestContext, toResponse } from '@/lib/auth/http'
import { login } from '@/lib/auth/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  email: emailSchema,
  password: passwordSchema,
})

/**
 * POST /api/auth/login
 *
 * On success the session cookie is set by `createSession` inside the service.
 * An unverified account returns ok:true with needsVerification, because the
 * caller proved they hold the password — telling them to go and verify is
 * helpful, not an information leak.
 */
export async function POST(request: Request) {
  const body = await parseBody(request, schema)
  if (!body.ok) return body.response

  const result = await login(body.data.email, body.data.password, requestContext(request))
  return toResponse(result)
}
