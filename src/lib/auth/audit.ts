import 'server-only'
import { query } from '@/lib/db/client'
import type { Role } from './roles'

/**
 * The audit trail.
 *
 * Append-only by convention — nothing in this codebase updates or deletes an
 * `audit_log` row. A lending decision has to be reconstructable years after
 * the fact: who approved it, under which role, on what evidence, and with what
 * reasoning they recorded at the time.
 *
 * The actor's email and role are denormalised onto every row on purpose. If
 * that user is later deleted, the FK goes null but the trail must still say
 * who made the decision.
 */

export type AuditAction =
  // auth
  | 'user.signup'
  | 'user.email_verified'
  | 'user.login'
  | 'user.login_failed'
  | 'user.logout'
  | 'user.password_reset_requested'
  | 'user.password_reset_completed'
  | 'user.google_linked'
  | 'user.google_signup'
  // administration
  | 'user.role_changed'
  | 'user.suspended'
  | 'user.reactivated'
  | 'user.invited'
  // lending decisions
  | 'application.approved'
  | 'application.rejected'
  | 'application.sent_to_review'
  | 'application.viewed'
  // scoring and monitoring
  | 'score.computed'
  | 'customer.rescored'
  | 'alert.acknowledged'

export interface AuditActor {
  id: string | null
  email: string | null
  role: Role | null
}

export interface AuditEntry {
  actor: AuditActor
  action: AuditAction
  entityType: string
  entityId?: string | null
  details?: Record<string, unknown>
  ipAddress?: string | null
  userAgent?: string | null
}

/**
 * Record an auditable event.
 *
 * Never throws. An audit write failing must not roll back the decision it
 * describes — losing the log entry is bad, but refusing a loan approval
 * because the log is unavailable is worse. Failures are logged loudly so they
 * surface in monitoring instead of vanishing.
 */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    await query(
      `insert into audit_log
         (actor_id, actor_email, actor_role, action, entity_type, entity_id,
          details, ip_address, user_agent)
       values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::inet, $9)`,
      [
        entry.actor.id,
        entry.actor.email,
        entry.actor.role,
        entry.action,
        entry.entityType,
        entry.entityId ?? null,
        JSON.stringify(entry.details ?? {}),
        entry.ipAddress ?? null,
        entry.userAgent?.slice(0, 500) ?? null,
      ],
    )
  } catch (err) {
    console.error(`[audit] FAILED to record ${entry.action}:`, err)
  }
}

export interface AuditRow {
  id: string
  actorId: string | null
  actorEmail: string | null
  actorRole: string | null
  action: string
  entityType: string
  entityId: string | null
  details: Record<string, unknown>
  ipAddress: string | null
  createdAt: Date
}

export interface AuditFilters {
  actorId?: string
  action?: string
  entityType?: string
  entityId?: string
  since?: Date
  limit?: number
  offset?: number
}

export async function listAuditEntries(
  filters: AuditFilters = {},
): Promise<{ rows: AuditRow[]; total: number }> {
  const conditions: string[] = []
  const params: unknown[] = []

  if (filters.actorId) {
    params.push(filters.actorId)
    conditions.push(`actor_id = $${params.length}`)
  }
  if (filters.action) {
    params.push(filters.action)
    conditions.push(`action = $${params.length}`)
  }
  if (filters.entityType) {
    params.push(filters.entityType)
    conditions.push(`entity_type = $${params.length}`)
  }
  if (filters.entityId) {
    params.push(filters.entityId)
    conditions.push(`entity_id = $${params.length}`)
  }
  if (filters.since) {
    params.push(filters.since)
    conditions.push(`created_at >= $${params.length}`)
  }

  const where = conditions.length ? `where ${conditions.join(' and ')}` : ''

  const totalRows = await query<{ count: string }>(
    `select count(*)::text as count from audit_log ${where}`,
    params,
  )

  params.push(filters.limit ?? 100, filters.offset ?? 0)
  const rows = await query<Record<string, unknown>>(
    `select id::text, actor_id, actor_email, actor_role, action, entity_type,
            entity_id, details, ip_address::text, created_at
       from audit_log
       ${where}
      order by created_at desc
      limit $${params.length - 1} offset $${params.length}`,
    params,
  )

  return {
    total: Number(totalRows[0]?.count ?? 0),
    rows: rows.map((r) => ({
      id: r.id as string,
      actorId: (r.actor_id as string | null) ?? null,
      actorEmail: (r.actor_email as string | null) ?? null,
      actorRole: (r.actor_role as string | null) ?? null,
      action: r.action as string,
      entityType: r.entity_type as string,
      entityId: (r.entity_id as string | null) ?? null,
      details: (r.details as Record<string, unknown>) ?? {},
      ipAddress: (r.ip_address as string | null) ?? null,
      createdAt: r.created_at as Date,
    })),
  }
}

/** Human-readable phrasing for the audit table. */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  'user.signup': 'Signed up',
  'user.email_verified': 'Verified their email',
  'user.login': 'Signed in',
  'user.login_failed': 'Failed sign-in attempt',
  'user.logout': 'Signed out',
  'user.password_reset_requested': 'Requested a password reset',
  'user.password_reset_completed': 'Reset their password',
  'user.google_linked': 'Linked a Google account',
  'user.google_signup': 'Signed up with Google',
  'user.role_changed': 'Changed a role',
  'user.suspended': 'Suspended a user',
  'user.reactivated': 'Reactivated a user',
  'user.invited': 'Invited a user',
  'application.approved': 'Approved an application',
  'application.rejected': 'Rejected an application',
  'application.sent_to_review': 'Sent an application to manual review',
  'application.viewed': 'Opened an application',
  'score.computed': 'Computed a score',
  'customer.rescored': 'Re-scored a customer',
  'alert.acknowledged': 'Acknowledged an alert',
}

export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action
}
