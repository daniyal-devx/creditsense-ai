import * as React from 'react'
import { cn } from '@/lib/utils/cn'

/**
 * A horizontal progress / proportion bar.
 *
 * Used for affordability meters, portfolio composition, and anywhere a
 * percentage needs to be read at a glance. The numeric value is always
 * available to assistive tech through the ARIA attributes even when the
 * label is hidden.
 */
export function Progress({
  value,
  max = 100,
  label,
  valueLabel,
  tone = 'primary',
  size = 'md',
  className,
  showLabel = true,
}: {
  value: number
  max?: number
  /** Required for accessibility even when `showLabel` is false. */
  label: string
  /** Text shown on the right, e.g. "Rs 12,000 of Rs 40,000". */
  valueLabel?: React.ReactNode
  tone?: 'primary' | 'success' | 'warning' | 'danger' | 'info'
  size?: 'sm' | 'md' | 'lg'
  className?: string
  showLabel?: boolean
}) {
  const clamped = Math.min(max, Math.max(0, value))
  const pct = max === 0 ? 0 : (clamped / max) * 100

  const toneClass = {
    primary: 'bg-primary',
    success: 'bg-success',
    warning: 'bg-warning',
    danger: 'bg-danger',
    info: 'bg-info',
  }[tone]

  const heightClass = { sm: 'h-1.5', md: 'h-2', lg: 'h-3' }[size]

  return (
    <div className={cn('w-full min-w-0', className)}>
      {showLabel && (
        <div className="mb-1.5 flex items-baseline justify-between gap-3">
          <span className="truncate text-sm font-medium text-foreground">{label}</span>
          {valueLabel && (
            <span className="shrink-0 text-sm tabular-nums text-muted-foreground">{valueLabel}</span>
          )}
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={Math.round(clamped)}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label}
        className={cn('w-full overflow-hidden rounded-full bg-muted', heightClass)}
      >
        <div
          className={cn('h-full rounded-full transition-[width] duration-500 ease-out', toneClass)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

/**
 * A segmented bar — several proportions in one track, e.g. the portfolio split
 * across risk bands. Segments carry their own colour via `className`.
 */
export function SegmentedBar({
  segments,
  label,
  size = 'md',
  className,
}: {
  segments: { key: string; value: number; className: string; label: string }[]
  label: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0)
  const heightClass = { sm: 'h-1.5', md: 'h-2.5', lg: 'h-4' }[size]

  return (
    <div
      className={cn('flex w-full overflow-hidden rounded-full bg-muted', heightClass, className)}
      role="img"
      aria-label={`${label}: ${segments.map((s) => `${s.label} ${total ? Math.round((s.value / total) * 100) : 0}%`).join(', ')}`}
    >
      {total > 0 &&
        segments.map((s) =>
          s.value > 0 ? (
            <div
              key={s.key}
              className={cn('h-full transition-[width] duration-500 ease-out', s.className)}
              style={{ width: `${(s.value / total) * 100}%` }}
            />
          ) : null,
        )}
    </div>
  )
}
