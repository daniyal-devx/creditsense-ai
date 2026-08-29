'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import type { ColumnDef } from '@tanstack/react-table'
import { Wallet } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { DataTable } from '@/components/ui/data-table'
import type { CustomerSummary } from '@/lib/db/customers'
import { formatPKR, formatPercent, titleFromSlug } from '@/lib/utils/format'

/**
 * The customer list.
 *
 * Desktop gets the full table; mobile gets a card carrying only the three
 * things that actually matter at this stage — who they are, what they earn,
 * and whether they pay their bills. Everything else is one tap away on the
 * profile, and cramming it into 320px would make all of it unreadable.
 */

function punctualityTone(value: number | null) {
  if (value === null) return 'neutral' as const
  if (value >= 0.9) return 'success' as const
  if (value >= 0.7) return 'warning' as const
  return 'danger' as const
}

export function CustomersTable({ customers }: { customers: CustomerSummary[] }) {
  const router = useRouter()

  const columns = React.useMemo<ColumnDef<CustomerSummary, unknown>[]>(
    () => [
      {
        accessorKey: 'fullName',
        header: 'Applicant',
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <Avatar name={row.original.fullName} size="sm" />
            <div className="min-w-0">
              <p className="truncate font-medium">{row.original.fullName}</p>
              <p className="truncate text-xs text-muted-foreground">{row.original.occupation}</p>
            </div>
          </div>
        ),
      },
      {
        accessorKey: 'city',
        header: 'City',
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.city}</span>,
      },
      {
        accessorKey: 'avgMonthlyInflow',
        header: 'Monthly income',
        cell: ({ row }) => (
          <span className="font-medium tabular-nums">
            {row.original.avgMonthlyInflow === null
              ? '—'
              : formatPKR(row.original.avgMonthlyInflow)}
          </span>
        ),
      },
      {
        accessorKey: 'incomeVolatility',
        header: 'Stability',
        cell: ({ row }) => {
          const v = row.original.incomeVolatility
          if (v === null) return <span className="text-muted-foreground">—</span>
          return (
            <span className="tabular-nums">
              {v.toFixed(2)}
              <span className="ml-1.5 text-xs text-muted-foreground">
                {v <= 0.35 ? 'steady' : v <= 0.7 ? 'variable' : 'volatile'}
              </span>
            </span>
          )
        },
      },
      {
        accessorKey: 'billPunctuality',
        header: 'Bills on time',
        cell: ({ row }) => {
          const v = row.original.billPunctuality
          if (v === null) return <span className="text-muted-foreground">—</span>
          return (
            <Badge tone={punctualityTone(v)} size="sm">
              {formatPercent(v, { decimals: 0 })}
            </Badge>
          )
        },
      },
      {
        accessorKey: 'walletTenureMonths',
        header: 'Tenure',
        cell: ({ row }) => (
          <span className="tabular-nums text-muted-foreground">
            {row.original.walletTenureMonths === null
              ? '—'
              : `${row.original.walletTenureMonths} mo`}
          </span>
        ),
      },
      {
        id: 'file',
        header: 'Credit file',
        cell: ({ row }) =>
          row.original.hasBankLoanHistory ? (
            <Badge tone="neutral" size="sm">
              Has history
            </Badge>
          ) : (
            <Badge tone="primary" size="sm">
              Thin file
            </Badge>
          ),
      },
    ],
    [],
  )

  return (
    <DataTable
      caption="Customers and their digital signal profiles"
      data={customers}
      columns={columns}
      getRowId={(row) => row.id}
      searchable
      searchPlaceholder="Search by name, occupation, phone or CNIC…"
      pageSize={15}
      stickyFirstColumn
      onRowClick={(row) => router.push(`/customers/${row.id}`)}
      emptyTitle="No customers yet"
      emptyDescription="Run npm run db:seed to load the synthetic population."
      renderMobileCard={(row) => (
        <Card className="p-4" interactive>
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <Avatar name={row.fullName} size="sm" />
              <div className="min-w-0">
                <p className="truncate font-medium">{row.fullName}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {row.occupation} · {row.city}
                </p>
              </div>
            </div>
            {!row.hasBankLoanHistory && (
              <Badge tone="primary" size="sm" className="shrink-0">
                Thin file
              </Badge>
            )}
          </div>

          <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-border pt-3">
            <div>
              <dt className="text-xs text-muted-foreground">Monthly income</dt>
              <dd className="mt-0.5 font-semibold tabular-nums">
                {row.avgMonthlyInflow === null ? '—' : formatPKR(row.avgMonthlyInflow)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Bills on time</dt>
              <dd className="mt-0.5">
                {row.billPunctuality === null ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <Badge tone={punctualityTone(row.billPunctuality)} size="sm">
                    {formatPercent(row.billPunctuality, { decimals: 0 })}
                  </Badge>
                )}
              </dd>
            </div>
          </dl>

          <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Wallet className="size-3.5" aria-hidden="true" />
            {titleFromSlug(row.primaryWallet)} · {row.walletTenureMonths ?? '—'} months of history
          </p>
        </Card>
      )}
    />
  )
}
