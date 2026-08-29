import { Check, Clock, X } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { formatDate, formatPKR } from '@/lib/utils/format'
import type { BillRow } from '@/lib/db/customers'

/**
 * The bill payment record, month by month.
 *
 * This is the single most persuasive panel in the whole applicant view. A
 * thin-file applicant has no repayment history a bureau can show — but a row
 * of green ticks stretching back a year is exactly the same evidence, gathered
 * from an obligation they were already meeting with their own money.
 *
 * Status is carried by an icon and a label as well as colour, so the record
 * survives being printed in greyscale and attached to a credit file.
 */

const STATUS_CONFIG = {
  paid_on_time: {
    label: 'On time',
    icon: Check,
    cell: 'bg-risk-low-soft text-risk-low-on-soft border-risk-low/30',
    dot: 'bg-risk-low',
  },
  paid_late: {
    label: 'Late',
    icon: Clock,
    cell: 'bg-risk-moderate-soft text-risk-moderate-on-soft border-risk-moderate/30',
    dot: 'bg-risk-moderate',
  },
  unpaid: {
    label: 'Unpaid',
    icon: X,
    cell: 'bg-risk-veryhigh-soft text-risk-veryhigh-on-soft border-risk-veryhigh/30',
    dot: 'bg-risk-veryhigh',
  },
} as const

export function BillTimeline({ bills }: { bills: BillRow[] }) {
  if (bills.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No utility bills on record for this applicant.
      </p>
    )
  }

  // Group by biller so each utility reads as its own run of months.
  const byBiller = new Map<string, BillRow[]>()
  for (const bill of bills) {
    const key = `${bill.billerType}|${bill.billerName}`
    const list = byBiller.get(key)
    if (list) list.push(bill)
    else byBiller.set(key, [bill])
  }

  return (
    <div className="flex flex-col gap-5">
      {[...byBiller.entries()].map(([key, billerBills]) => {
        const [type, name] = key.split('|')
        // Oldest first, so the row reads left to right like a timeline.
        const ordered = [...billerBills].sort(
          (a, b) => a.billingMonth.getTime() - b.billingMonth.getTime(),
        )
        const onTime = ordered.filter((b) => b.status === 'paid_on_time').length

        return (
          <div key={key} className="min-w-0">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium capitalize">{type.replace('_', ' ')}</p>
                <p className="truncate text-xs text-muted-foreground">{name}</p>
              </div>
              <p className="shrink-0 text-sm tabular-nums text-muted-foreground">
                <span className="font-semibold text-foreground">{onTime}</span> of{' '}
                {ordered.length} on time
              </p>
            </div>

            {/* The months scroll horizontally *inside their own container* —
                never the page. This is the one place sideways movement is
                allowed, and it is opted into deliberately. */}
            <ol className="no-scrollbar flex gap-1.5 overflow-x-auto pb-1">
              {ordered.map((bill) => {
                const config = STATUS_CONFIG[bill.status]
                const Icon = config.icon
                const month = bill.billingMonth.toLocaleDateString('en-GB', { month: 'short' })

                return (
                  <li key={bill.id} className="shrink-0">
                    <div
                      className={cn(
                        'flex w-12 flex-col items-center gap-1 rounded-lg border px-1 py-2',
                        config.cell,
                      )}
                      title={`${name} — ${formatDate(bill.billingMonth)} — ${config.label}${
                        bill.daysLate && bill.daysLate > 0 ? ` by ${bill.daysLate} days` : ''
                      } — ${formatPKR(bill.amountDue)}`}
                    >
                      <Icon className="size-4" aria-hidden="true" />
                      <span className="text-[10px] font-medium leading-none">{month}</span>
                    </div>
                    <span className="sr-only">
                      {name}, {formatDate(bill.billingMonth)}, {formatPKR(bill.amountDue)},{' '}
                      {config.label}
                      {bill.daysLate && bill.daysLate > 0 ? ` by ${bill.daysLate} days` : ''}
                    </span>
                  </li>
                )
              })}
            </ol>
          </div>
        )
      })}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-3 text-xs">
        {(Object.keys(STATUS_CONFIG) as (keyof typeof STATUS_CONFIG)[]).map((status) => {
          const config = STATUS_CONFIG[status]
          const Icon = config.icon
          return (
            <span key={status} className="flex items-center gap-1.5 text-muted-foreground">
              <Icon className="size-3.5" aria-hidden="true" />
              {config.label}
            </span>
          )
        })}
      </div>
    </div>
  )
}

/**
 * A compact punctuality bar for dense contexts — the queue row, a summary card.
 * Shows the proportions without needing the month-by-month detail.
 */
export function BillPunctualityBar({
  onTime,
  late,
  unpaid,
  className,
}: {
  onTime: number
  late: number
  unpaid: number
  className?: string
}) {
  const total = onTime + late + unpaid
  if (total === 0) {
    return <p className={cn('text-sm text-muted-foreground', className)}>No bills on record</p>
  }

  const segments = [
    { key: 'on-time', value: onTime, className: 'bg-risk-low', label: 'on time' },
    { key: 'late', value: late, className: 'bg-risk-moderate', label: 'late' },
    { key: 'unpaid', value: unpaid, className: 'bg-risk-veryhigh', label: 'unpaid' },
  ]

  return (
    <div className={className}>
      <div
        className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={segments.map((s) => `${s.value} ${s.label}`).join(', ')}
      >
        {segments.map((s) =>
          s.value > 0 ? (
            <div
              key={s.key}
              className={s.className}
              style={{ width: `${(s.value / total) * 100}%` }}
            />
          ) : null,
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {segments.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span className={cn('size-2 rounded-full', s.className)} aria-hidden="true" />
            {s.value} {s.label}
          </span>
        ))}
      </div>
    </div>
  )
}
