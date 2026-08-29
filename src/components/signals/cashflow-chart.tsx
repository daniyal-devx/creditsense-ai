'use client'

import * as React from 'react'
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { MonthlyBucket } from '@/lib/features/types'
import { formatPKR, formatPKRCompact } from '@/lib/utils/format'

/**
 * Monthly money in versus money out.
 *
 * This is the chart that makes the thin-file argument visible: a lender
 * looking at it can see a real, repeating income stream where a credit bureau
 * would show an empty file.
 *
 * Data density scales with the screen. On a phone the axis labels thin out and
 * only the last 6 months are plotted — twelve bars in 320px is an unreadable
 * smear, and the recent months are the ones that drive the decision anyway.
 */
export function CashflowChart({
  buckets,
  className,
}: {
  buckets: MonthlyBucket[]
  className?: string
}) {
  const [isNarrow, setIsNarrow] = React.useState(false)

  React.useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)')
    const update = () => setIsNarrow(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  const data = React.useMemo(() => {
    const source = isNarrow ? buckets.slice(-6) : buckets.slice(-12)
    return source.map((b) => {
      const [year, month] = b.month.split('-')
      const date = new Date(Date.UTC(Number(year), Number(month) - 1, 1))
      return {
        ...b,
        label: date.toLocaleDateString('en-GB', { month: 'short' }),
        fullLabel: date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
      }
    })
  }, [buckets, isNarrow])

  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No transaction history in this window.
      </p>
    )
  }

  return (
    <div className={className}>
      {/* A table conveying the same numbers, for screen readers and for anyone
          who cannot use the chart. Charts are images to assistive tech. */}
      <div className="sr-only">
        <table>
        <caption>Monthly money in and money out</caption>
        <thead>
          <tr>
            <th scope="col">Month</th>
            <th scope="col">Money in</th>
            <th scope="col">Money out</th>
            <th scope="col">Net</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.month}>
              <th scope="row">{d.fullLabel}</th>
              <td>{formatPKR(d.inflow)}</td>
              <td>{formatPKR(d.outflow)}</td>
              <td>{formatPKR(d.net)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      <div className="h-64 w-full sm:h-72" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -12 }}>
            <defs>
              <linearGradient id="inflowFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-3)" stopOpacity={0.28} />
                <stop offset="100%" stopColor="var(--chart-3)" stopOpacity={0.02} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
              axisLine={{ stroke: 'var(--border)' }}
              tickLine={false}
              interval={isNarrow ? 0 : 'preserveStartEnd'}
            />
            <YAxis
              tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={56}
              tickFormatter={(v: number) => formatPKRCompact(v).replace('Rs ', '')}
            />
            <Tooltip
              cursor={{ fill: 'var(--accent)', opacity: 0.5 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const point = payload[0].payload as (typeof data)[number]
                return (
                  <div className="rounded-lg border border-border bg-surface p-3 shadow-e3">
                    <p className="text-sm font-semibold">{point.fullLabel}</p>
                    <dl className="mt-2 space-y-1 text-sm">
                      <div className="flex items-center justify-between gap-6">
                        <dt className="text-muted-foreground">Money in</dt>
                        <dd className="font-medium tabular-nums text-chart-3">
                          {formatPKR(point.inflow)}
                        </dd>
                      </div>
                      <div className="flex items-center justify-between gap-6">
                        <dt className="text-muted-foreground">Money out</dt>
                        <dd className="font-medium tabular-nums text-chart-5">
                          {formatPKR(point.outflow)}
                        </dd>
                      </div>
                      <div className="flex items-center justify-between gap-6 border-t border-border pt-1">
                        <dt className="text-muted-foreground">Net</dt>
                        <dd
                          className={
                            'font-semibold tabular-nums ' +
                            (point.net >= 0 ? 'text-success' : 'text-danger')
                          }
                        >
                          {formatPKR(point.net, { sign: true })}
                        </dd>
                      </div>
                    </dl>
                  </div>
                )
              }}
            />

            <Area
              type="monotone"
              dataKey="inflow"
              stroke="none"
              fill="url(#inflowFill)"
              isAnimationActive={false}
            />
            <Bar dataKey="outflow" fill="var(--chart-5)" opacity={0.75} radius={[3, 3, 0, 0]} maxBarSize={26} />
            <Line
              type="monotone"
              dataKey="inflow"
              stroke="var(--chart-3)"
              strokeWidth={2.5}
              dot={{ r: 3, fill: 'var(--chart-3)', strokeWidth: 0 }}
              activeDot={{ r: 5 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-full bg-chart-3" aria-hidden="true" />
          <span className="text-muted-foreground">Money in (earned)</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-3 rounded-[2px] bg-chart-5 opacity-75" aria-hidden="true" />
          <span className="text-muted-foreground">Money out</span>
        </span>
        {isNarrow && buckets.length > 6 && (
          <span className="text-muted-foreground">Last 6 months</span>
        )}
      </div>
    </div>
  )
}
