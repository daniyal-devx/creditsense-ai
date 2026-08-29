import { z } from 'zod'
import {
  emailSchema,
  nameSchema,
  parseBody,
  passwordSchema,
  requestContext,
  toResponse,
} from '@/lib/auth/http'
import { signup } from '@/lib/auth/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  fullName: nameSchema,
  email: emailSchema,
  password: passwordSchema,
})

/**
 * POST /api/auth/signup
 *
 * Always responds the same way whether or not the email is already
 * registered — see the note in `lib/auth/service.ts`. The client shows the
 * "check your email" screen either way.
 */
export async function POST(request: Request) {
  const body = await parseBody(request, schema)
  if (!body.ok) return body.response

  const result = await signup(body.data, requestContext(request))
  return toResponse(result, 201)
}
