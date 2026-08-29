'use client'

import * as React from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { RISK_BANDS_ASCENDING } from '@/lib/risk'
import type { ScoreDistributionRow } from '@/lib/db/scores'
import type { SnapshotRow } from '@/lib/db/monitoring'
import { formatNumber, formatPKRCompact, formatPercent } from '@/lib/utils/format'

/**
 * Portfolio charts.
 *
 * Data density scales with the screen: on a phone each chart drops to a single
 * metric with fewer ticks and a shorter window, because five overlapping series
 * on 320px is an unreadable smear. Every chart also ships an sr-only table —
 * a chart is an image to assistive technology, and a risk analyst using a
 * screen reader needs the numbers, not a label saying "chart".
 */

function useIsNarrow(): boolean {
  const [narrow, setNarrow] = React.useState(false)
  React.useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)')
    const update = () => setNarrow(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  return narrow
}

/** Where the book sits today, by risk band. */
export function RiskDistributionChart({ distribution }: { distribution: ScoreDistributionRow[] }) {
  const total = distribution.reduce((sum, d) => sum + d.customers, 0)

  const data = RISK_BANDS_ASCENDING.map((band) => {
    const row = distribution.find((d) => d.band.id === band.id)
    return {
      band: band.shortLabel,
      fullLabel: band.label,
      customers: row?.customers ?? 0,
      colour: band.cssVar,
      share: total > 0 ? (row?.customers ?? 0) / total : 0,
      avgScore: row?.avgScore ?? 0,
    }
  })

  return (
    <div>
      <div className="sr-only">
        <table>
        <caption>Customers by risk band</caption>
        <thead>
          <tr>
            <th scope="col">Risk band</th>
            <th scope="col">Customers</th>
            <th scope="col">Share</th>
            <th scope="col">Average score</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.band}>
              <th scope="row">{d.fullLabel}</th>
              <td>{d.customers}</td>
              <td>{formatPercent(d.share)}</td>
              <td>{d.avgScore}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      <div className="h-64 w-full sm:h-72" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="band"
              tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
              axisLine={{ stroke: 'var(--border)' }}
              tickLine={false}
              interval={0}
            />
            <YAxis
              tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={44}
            />
            <Tooltip
              cursor={{ fill: 'var(--accent)', opacity: 0.5 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const point = payload[0].payload as (typeof data)[number]
                return (
                  <div className="rounded-lg border border-border bg-surface p-3 shadow-e3">
                    <p className="text-sm font-semibold">{point.fullLabel}</p>
                    <p className="mt-1 text-sm tabular-nums text-muted-foreground">
                      {formatNumber(point.customers)} customers ·{' '}
                      {formatPercent(point.share, { decimals: 0 })}
                    </p>
                    {point.avgScore > 0 && (
                      <p className="text-sm tabular-nums text-muted-foreground">
                        Average score {point.avgScore}
                      </p>
                    )}
                  </div>
                )
              }}
            />
            <Bar dataKey="customers" radius={[4, 4, 0, 0]} maxBarSize={64}>
              {data.map((entry) => (
                <Cell key={entry.band} fill={entry.colour} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

/** How the average score has moved. */
export function ScoreTrendChart({ snapshots }: { snapshots: SnapshotRow[] }) {
  const isNarrow = useIsNarrow()
  const data = isNarrow ? snapshots.slice(-14) : snapshots

  if (data.length < 2) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Not enough history yet. A trend needs at least two daily snapshots — run{' '}
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">npm run db:monitor</code>{' '}
        on consecutive days.
      </p>
    )
  }

  return (
    <div>
      <div className="sr-only">
        <table>
        <caption>Average portfolio score over time</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Average score</th>
            <th scope="col">Open alerts</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.date}>
              <th scope="row">{d.date}</th>
              <td>{d.averageScore}</td>
              <td>{d.openAlerts}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      <div className="h-64 w-full sm:h-72" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
              axisLine={{ stroke: 'var(--border)' }}
              tickLine={false}
              tickFormatter={(v: string) => v.slice(5)}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={['dataMin - 20', 'dataMax + 20']}
              tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={44}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null
                const point = payload[0].payload as SnapshotRow
                return (
                  <div className="rounded-lg border border-border bg-surface p-3 shadow-e3">
                    <p className="text-sm font-semibold">{label}</p>
                    <p className="mt-1 text-sm tabular-nums text-muted-foreground">
                      Average score {point.averageScore}
                    </p>
                    <p className="text-sm tabular-nums text-muted-foreground">
                      {point.openAlerts} open alerts
                    </p>
                  </div>
                )
              }}
            />
            <Line
              type="monotone"
              dataKey="averageScore"
              stroke="var(--chart-1)"
              strokeWidth={2.5}
              dot={{ r: 3, fill: 'var(--chart-1)', strokeWidth: 0 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

/** Band composition over time — where the book is drifting. */
export function BandMigrationChart({ snapshots }: { snapshots: SnapshotRow[] }) {
  const isNarrow = useIsNarrow()
  const data = (isNarrow ? snapshots.slice(-14) : snapshots).map((s) => ({
    date: s.date,
    'Very Low': s.bands.veryLow,
    Low: s.bands.low,
    Moderate: s.bands.moderate,
    High: s.bands.high,
    'Very High': s.bands.veryHigh,
  }))

  if (data.length < 2) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Not enough history yet — band composition needs at least two daily snapshots.
      </p>
    )
  }

  const series = [
    { key: 'Very Low', colour: 'var(--risk-verylow)' },
    { key: 'Low', colour: 'var(--risk-low)' },
    { key: 'Moderate', colour: 'var(--risk-moderate)' },
    { key: 'High', colour: 'var(--risk-high)' },
    { key: 'Very High', colour: 'var(--risk-veryhigh)' },
  ]

  return (
    <div>
      <div className="h-64 w-full sm:h-72" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
              axisLine={{ stroke: 'var(--border)' }}
              tickLine={false}
              tickFormatter={(v: string) => v.slice(5)}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={44}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null
                return (
                  <div className="rounded-lg border border-border bg-surface p-3 shadow-e3">
                    <p className="text-sm font-semibold">{label}</p>
                    <dl className="mt-1.5 space-y-0.5">
                      {payload.map((entry) => (
                        <div key={entry.name} className="flex items-center justify-between gap-6 text-sm">
                          <dt className="flex items-center gap-1.5 text-muted-foreground">
                            <span
                              className="size-2 rounded-full"
                              style={{ backgroundColor: entry.color }}
                            />
                            {entry.name}
                          </dt>
                          <dd className="font-medium tabular-nums">{entry.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                )
              }}
            />
            {series.map((s) => (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                stackId="bands"
                stroke={s.colour}
                fill={s.colour}
                fillOpacity={0.75}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <ul className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs">
        {series.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5 text-muted-foreground">
            <span className="size-2.5 rounded-full" style={{ backgroundColor: s.colour }} />
            {s.key}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Exposure at risk over time. */
export function ExposureChart({ snapshots }: { snapshots: SnapshotRow[] }) {
  const isNarrow = useIsNarrow()
  const data = isNarrow ? snapshots.slice(-14) : snapshots

  if (data.length < 2) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Not enough history yet.
      </p>
    )
  }

  return (
    <div className="h-56 w-full sm:h-64" aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -6 }}>
          <defs>
            <linearGradient id="exposureFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.3} />
              <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
            axisLine={{ stroke: 'var(--border)' }}
            tickLine={false}
            tickFormatter={(v: string) => v.slice(5)}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={56}
            tickFormatter={(v: number) => formatPKRCompact(v).replace('Rs ', '')}
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null
              const point = payload[0].payload as SnapshotRow
              return (
                <div className="rounded-lg border border-border bg-surface p-3 shadow-e3">
                  <p className="text-sm font-semibold">{label}</p>
                  <p className="mt-1 text-sm tabular-nums text-muted-foreground">
                    {formatPKRCompact(point.totalOutstanding)} outstanding
                  </p>
                  <p className="text-sm tabular-nums text-muted-foreground">
                    {point.activeLoans} active · {point.delinquentLoans} delinquent
                  </p>
                </div>
              )
            }}
          />
          <Area
            type="monotone"
            dataKey="totalOutstanding"
            stroke="var(--chart-2)"
            strokeWidth={2.5}
            fill="url(#exposureFill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
