import * as React from 'react'
import { Minus, TrendingDown, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { InfoTip } from '@/components/ui/tooltip'

/**
 * One engineered signal, shown the way a loan officer needs to read it:
 * the number, what it means in words, and whether it helps or hurts.
 *
 * The `interpretation` line is not decoration. A raw "income volatility 0.62"
 * means nothing to the person making the decision — "income swings a lot month
 * to month" is the same fact in a form they can act on and repeat back to the
 * applicant.
 */

export type SignalQuality = 'good' | 'fair' | 'poor' | 'neutral'

const QUALITY_STYLES: Record<SignalQuality, { value: string; chip: string; label: string }> = {
  good: { value: 'text-risk-low', chip: 'bg-risk-low-soft text-risk-low-on-soft', label: 'Positive' },
  fair: {
    value: 'text-risk-moderate',
    chip: 'bg-risk-moderate-soft text-risk-moderate-on-soft',
    label: 'Mixed',
  },
  poor: {
    value: 'text-risk-veryhigh',
    chip: 'bg-risk-veryhigh-soft text-risk-veryhigh-on-soft',
    label: 'Concern',
  },
  neutral: { value: 'text-foreground', chip: 'bg-muted text-muted-foreground', label: '' },
}

export interface SignalStatProps {
  label: string
  value: React.ReactNode
  /** Plain-language reading of the number. Keep it to one short sentence. */
  interpretation?: string
  quality?: SignalQuality
  /** What the metric means, behind a "?" the user can tap. */
  explain?: string
  /** Direction of change, when there is a comparison to make. */
  trend?: 'up' | 'down' | 'flat'
  /** Whether "up" is good for this metric. Volatility going up is bad. */
  higherIsBetter?: boolean
  className?: string
}

export function SignalStat({
  label,
  value,
  interpretation,
  quality = 'neutral',
  explain,
  trend,
  higherIsBetter = true,
  className,
}: SignalStatProps) {
  const styles = QUALITY_STYLES[quality]
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus
  const trendIsGood = trend === 'flat' ? null : (trend === 'up') === higherIsBetter

  return (
    <div className={cn('min-w-0', className)}>
      <div className="flex items-center gap-1.5">
        <p className="truncate text-sm text-muted-foreground">{label}</p>
        {explain && <InfoTip label={`What is ${label}?`} content={explain} />}
      </div>

      <div className="mt-1 flex items-baseline gap-2">
        <p className={cn('text-xl font-semibold tabular-nums sm:text-2xl', styles.value)}>{value}</p>
        {trend && (
          <span
            className={cn(
              'flex items-center gap-0.5 text-xs font-medium',
              trendIsGood === null
                ? 'text-muted-foreground'
                : trendIsGood
                  ? 'text-risk-low'
                  : 'text-risk-veryhigh',
            )}
          >
            <TrendIcon className="size-3.5" aria-hidden="true" />
          </span>
        )}
      </div>

      {interpretation && (
        <p className="mt-1 text-sm leading-snug text-muted-foreground">{interpretation}</p>
      )}
    </div>
  )
}

/** A responsive grid of signal stats — 2 up on mobile, 4 on desktop. */
export function SignalGrid({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('grid grid-cols-2 gap-x-4 gap-y-6 lg:grid-cols-4', className)}>
      {children}
    </div>
  )
}
