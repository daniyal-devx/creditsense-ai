import type { Metadata } from 'next'
import { ScrollText } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { Alert } from '@/components/ui/alert'
import { Avatar } from '@/components/ui/avatar'
import { Badge, type BadgeTone } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { auditActionLabel, listAuditEntries } from '@/lib/auth/audit'
import { requirePermission } from '@/lib/auth/guard'
import { ROLE_DEFINITIONS, isRole } from '@/lib/auth/roles'
import { formatDateTime, formatRelative } from '@/lib/utils/format'

export const metadata: Metadata = { title: 'Audit Trail' }
export const dynamic = 'force-dynamic'

/**
 * The audit trail.
 *
 * Append-only: this page never offers a way to edit or delete an entry, and
 * nothing in the codebase writes an UPDATE or DELETE against `audit_log`. A
 * lending decision has to be reconstructable years later, and a log that can
 * be tidied up is not evidence of anything.
 */
function toneForAction(action: string): BadgeTone {
  if (action.includes('rejected') || action.includes('suspended') || action.includes('failed')) {
    return 'danger'
  }
  if (action.includes('approved') || action.includes('verified') || action.includes('reactivated')) {
    return 'success'
  }
  if (action.includes('review') || action.includes('role_changed')) return 'warning'
  return 'neutral'
}

export default async function AuditPage() {
  await requirePermission('audit:read')

  const { rows, total } = await listAuditEntries({ limit: 200 })

  return (
    <>
      <PageHeader
        title="Audit trail"
        description="Every decision and account change, with who made it and when. Append-only — entries are never edited or deleted."
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Audit Trail' }]}
        badge={<Badge tone="neutral">{total.toLocaleString()} entries</Badge>}
      />

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ScrollText />}
            title="Nothing recorded yet"
            description="Sign-ins, role changes and lending decisions will appear here as they happen."
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          <Alert tone="info">
            Showing the most recent {rows.length.toLocaleString()} of {total.toLocaleString()}{' '}
            entries.
          </Alert>

          <Card>
            <ol className="divide-y divide-border">
              {rows.map((entry) => {
                const roleLabel = isRole(entry.actorRole)
                  ? ROLE_DEFINITIONS[entry.actorRole].label
                  : (entry.actorRole ?? 'System')

                return (
                  <li key={entry.id} className="flex gap-3 p-4 sm:gap-4 sm:p-5">
                    <Avatar
                      name={entry.actorEmail ?? 'System'}
                      size="sm"
                      className="mt-0.5 shrink-0"
                    />

                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="min-w-0 max-w-full truncate text-sm font-medium">
                          {entry.actorEmail ?? 'System'}
                        </span>
                        <Badge tone={toneForAction(entry.action)} size="sm">
                          {auditActionLabel(entry.action)}
                        </Badge>
                      </div>

                      <p className="mt-1 text-xs text-muted-foreground">
                        {roleLabel} · {entry.entityType}
                        {entry.entityId && (
                          <span className="font-mono"> {entry.entityId.slice(0, 8)}</span>
                        )}
                        {entry.ipAddress && ` · ${entry.ipAddress}`}
                      </p>

                      {Object.keys(entry.details).length > 0 && (
                        <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                          {Object.entries(entry.details).map(([key, value]) => (
                            <div key={key} className="flex items-baseline gap-1.5 text-xs">
                              <dt className="text-muted-foreground">{key}</dt>
                              <dd className="font-medium">{String(value)}</dd>
                            </div>
                          ))}
                        </dl>
                      )}
                    </div>

                    <time
                      dateTime={entry.createdAt.toISOString()}
                      title={formatDateTime(entry.createdAt)}
                      className="shrink-0 text-xs text-muted-foreground"
                    >
                      {formatRelative(entry.createdAt)}
                    </time>
                  </li>
                )
              })}
            </ol>
          </Card>
        </div>
      )}
    </>
  )
}
