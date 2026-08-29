import 'server-only'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { clientIp } from './rate-limit'
import type { AuthResult, RequestContext } from './service'

/**
 * Shared plumbing for the auth API routes.
 *
 * Keeps every endpoint returning the same response shape, and keeps the
 * validate-then-act dance out of the route handlers themselves.
 */

export function requestContext(request: Request): RequestContext {
  return {
    ipAddress: clientIp(request.headers),
    userAgent: request.headers.get('user-agent'),
  }
}

export interface ApiError {
  error: string
  field?: string
  retryAfterSeconds?: number
}

export function jsonError(
  message: string,
  status = 400,
  extra: Omit<ApiError, 'error'> = {},
): NextResponse {
  const headers: Record<string, string> = {}
  // A machine-readable Retry-After lets a client back off correctly rather
  // than hammering an endpoint that is already rate limiting it.
  if (extra.retryAfterSeconds) {
    headers['Retry-After'] = String(extra.retryAfterSeconds)
  }
  return NextResponse.json({ error: message, ...extra }, { status, headers })
}

/** Turn an AuthResult into a response, mapping rate-limits to 429. */
export function toResponse<T>(result: AuthResult<T>, successStatus = 200): NextResponse {
  if (result.ok) {
    return NextResponse.json({ ok: true, ...(result.data ?? {}) }, { status: successStatus })
  }
  const status = result.retryAfterSeconds ? 429 : 400
  return jsonError(result.error, status, {
    field: result.field,
    retryAfterSeconds: result.retryAfterSeconds,
  })
}

/**
 * Parse and validate a JSON body.
 *
 * Returns the first validation message rather than the whole Zod issue tree —
 * a form shows one error per field, and the raw tree would leak the schema's
 * internal shape to a caller probing the API.
 */
export async function parseBody<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<{ ok: true; data: z.infer<T> } | { ok: false; response: NextResponse }> {
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return { ok: false, response: jsonError('Expected a JSON body.') }
  }

  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return {
      ok: false,
      response: jsonError(first?.message ?? 'That request is not valid.', 400, {
        field: first?.path?.[0]?.toString(),
      }),
    }
  }

  return { ok: true, data: parsed.data }
}

// ---------------------------------------------------------------------------
// Shared schemas
// ---------------------------------------------------------------------------

export const emailSchema = z
  .string()
  .trim()
  .min(1, 'Enter your email address.')
  .max(254, 'That email address is too long.')
  .email('Enter a valid email address.')

export const codeSchema = z
  .string()
  .trim()
  // Accept the spaces and dashes people paste in from an email client.
  .transform((v) => v.replace(/\D/g, ''))
  .refine((v) => v.length === 6, 'Enter the 6-digit code from your email.')

export const passwordSchema = z
  .string()
  .min(1, 'Enter a password.')
  .max(200, 'That password is too long.')

export const nameSchema = z
  .string()
  .trim()
  .min(2, 'Enter your full name.')
  .max(120, 'That name is too long.')
