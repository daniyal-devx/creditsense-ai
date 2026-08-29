import { NextResponse } from 'next/server'
import { z } from 'zod'
import { guardApi } from '@/lib/auth/guard'
import { jsonError, parseBody, requestContext } from '@/lib/auth/http'
import { decideApplication } from '@/lib/db/applications'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  action: z.enum(['approve', 'reject', 'send_to_review']),
  reasoning: z
    .string()
    .trim()
    .min(10, 'Record your reasoning — at least a sentence.')
    .max(2000, 'That is too long for a decision note.'),
  approvedAmount: z.number().positive().max(10_000_000).optional(),
  approvedTenorMonths: z.number().int().min(1).max(60).optional(),
  evidence: z
    .object({
      score: z.number().nullable().optional(),
      band: z.string().nullable().optional(),
      fraudLevel: z.string().nullable().optional(),
      recommendedAmount: z.number().nullable().optional(),
    })
    .optional(),
})

/**
 * POST /api/applications/[id]/decide
 *
 * Guarded by `applications:decide`, which only the Loan Officer and the
 * Administrator hold. A Risk Analyst can read every application and decide
 * none of them — that separation is the point of having roles at all.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await guardApi('applications:decide')
  if (!guard.ok) return guard.response

  const { id } = await params
  const body = await parseBody(request, schema)
  if (!body.ok) return body.response

  const result = await decideApplication({
    applicationId: id,
    action: body.data.action,
    reasoning: body.data.reasoning,
    approvedAmount: body.data.approvedAmount,
    approvedTenorMonths: body.data.approvedTenorMonths,
    evidence: body.data.evidence,
    actor: { id: guard.user.id, email: guard.user.email, role: guard.user.role },
    context: requestContext(request),
  })

  if (!result.ok) {
    // 409: the request was well-formed but conflicts with the current state —
    // already decided, or held by FraudSense.
    return jsonError(result.error, 409)
  }

  return NextResponse.json({
    ok: true,
    status: result.status,
    loanReference: result.loanReference ?? null,
  })
}
