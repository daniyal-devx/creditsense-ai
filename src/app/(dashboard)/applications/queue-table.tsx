'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import type { ColumnDef } from '@tanstack/react-table'
import { AlertOctagon, Clock, ShieldAlert } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { RiskBadge } from '@/components/risk/risk-badge'
import { ScoreBar } from '@/components/score/score-gauge'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { DataTable } from '@/components/ui/data-table'
import type { QueueApplication } from '@/lib/db/applications'
import { formatPKR, formatRelative } from '@/lib/utils/format'

/**
 * The application queue.
 *
 * Desktop gets the full sortable table. Mobile gets a card carrying exactly
 * the four things that decide whether this application needs opening: who,
 * how much, the score band, and whether fraud has flagged it. Everything else
 * is one tap away — and cramming it into 320px would make none of it readable.
 */
export function QueueTable({ applications }: { applications: QueueApplication[] }) {
  const router = useRouter()

  const columns = React.useMemo<ColumnDef<QueueApplication, unknown>[]>(
    () => [
      {
        accessorKey: 'fullName',
        header: 'Applicant',
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <Avatar name={row.original.fullName} size="sm" />
            <div className="min-w-0">
              <p className="truncate font-medium">{row.original.fullName}</p>
              <p className="truncate text-xs text-muted-foreground">
                {row.original.occupation} · {row.original.city}
              </p>
            </div>
          </div>
        ),
      },
      {
        accessorKey: 'requestedAmount',
        header: 'Requested',
        cell: ({ row }) => (
          <div>
            <p className="font-medium tabular-nums">{formatPKR(row.original.requestedAmount)}</p>
            <p className="text-xs text-muted-foreground">
              over {row.original.requestedTenorMonths} months
            </p>
          </div>
        ),
      },
      {
        accessorKey: 'score',
        header: 'Score',
        cell: ({ row }) =>
          row.original.score === null ? (
            <span className="text-muted-foreground">Not scored</span>
          ) : (
            <ScoreBar score={row.original.score} className="min-w-28" />
          ),
      },
      {
        id: 'band',
        header: 'Risk',
        cell: ({ row }) =>
          row.original.band ? (
            <RiskBadge band={row.original.band} size="sm" />
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: 'fraud',
        header: 'Fraud',
        cell: ({ row }) => <FraudCell application={row.original} />,
      },
      {
        accessorKey: 'ageDays',
        header: 'Waiting',
        cell: ({ row }) => (
          <span
            className={cn(
              'flex items-center gap-1.5 text-sm tabular-nums',
              row.original.ageDays >= 3 ? 'font-medium text-warning' : 'text-muted-foreground',
            )}
          >
            {row.original.ageDays >= 3 && <Clock className="size-3.5" aria-hidden="true" />}
            {row.original.ageDays === 0 ? 'Today' : `${row.original.ageDays}d`}
          </span>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => (
          <Badge tone={row.original.status === 'in_review' ? 'warning' : 'neutral'} size="sm">
            {row.original.status === 'in_review' ? 'In review' : 'Pending'}
          </Badge>
        ),
      },
    ],
    [],
  )

  return (
    <DataTable
      caption="Applications awaiting a decision"
      data={applications}
      columns={columns}
      getRowId={(row) => row.id}
      searchable
      searchPlaceholder="Search by name, reference or city…"
      pageSize={15}
      stickyFirstColumn
      onRowClick={(row) => router.push(`/applications/${row.id}`)}
      emptyTitle="The queue is empty"
      emptyDescription="Every application has been decided. New ones appear here as they are submitted."
      renderMobileCard={(app) => (
        <Card className="p-4" interactive>
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <Avatar name={app.fullName} size="sm" />
              <div className="min-w-0">
                <p className="truncate font-medium">{app.fullName}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {app.occupation} · {formatRelative(app.submittedAt)}
                </p>
              </div>
            </div>
            <span className="shrink-0 text-right">
              <span className="block font-semibold tabular-nums">
                {formatPKR(app.requestedAmount)}
              </span>
              <span className="block text-xs text-muted-foreground">
                {app.requestedTenorMonths} months
              </span>
            </span>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
            {app.band ? (
              <RiskBadge band={app.band} size="sm" />
            ) : (
              <Badge tone="neutral" size="sm">
                Not scored
              </Badge>
            )}
            <FraudCell application={app} />
            {app.ageDays >= 3 && (
              <Badge tone="warning" size="sm" icon={<Clock />}>
                {app.ageDays}d waiting
              </Badge>
            )}
          </div>
        </Card>
      )}
    />
  )
}

function FraudCell({ application }: { application: QueueApplication }) {
  if (application.fraudLevel === 'block') {
    return (
      <Badge tone="danger" size="sm" icon={<AlertOctagon />}>
        Hold
      </Badge>
    )
  }
  if (application.fraudLevel === 'investigate') {
    return (
      <Badge tone="danger" size="sm" icon={<ShieldAlert />}>
        Investigate
      </Badge>
    )
  }
  if (application.fraudLevel === 'review') {
    return (
      <Badge tone="warning" size="sm">
        Minor
      </Badge>
    )
  }
  return <span className="text-xs text-muted-foreground">Clear</span>
}
