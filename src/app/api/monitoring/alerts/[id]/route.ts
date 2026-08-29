import { NextResponse } from 'next/server'
import { z } from 'zod'
import { recordAudit } from '@/lib/auth/audit'
import { guardApi } from '@/lib/auth/guard'
import { jsonError, parseBody, requestContext } from '@/lib/auth/http'
import { acknowledgeAlert } from '@/lib/db/monitoring'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  action: z.literal('acknowledge'),
  note: z.string().max(1000).optional(),
})

/**
 * PATCH /api/monitoring/alerts/[id]
 *
 * Acknowledging takes an alert off the open feed and records who did it. That
 * record matters: "nobody was told" and "somebody was told and did nothing"
 * are very different answers when a loan goes bad, and only the audit trail
 * can tell them apart.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await guardApi('monitoring:read')
  if (!guard.ok) return guard.response

  const { id } = await params
  const body = await parseBody(request, schema)
  if (!body.ok) return body.response

  const acknowledged = await acknowledgeAlert(id, guard.user.id, body.data.note)

  if (!acknowledged) {
    return jsonError('That alert is no longer open.', 409)
  }

  await recordAudit({
    actor: { id: guard.user.id, email: guard.user.email, role: guard.user.role },
    action: 'alert.acknowledged',
    entityType: 'monitoring_alert',
    entityId: id,
    details: { note: body.data.note ?? null },
    ...requestContext(request),
  })

  return NextResponse.json({ ok: true })
}
