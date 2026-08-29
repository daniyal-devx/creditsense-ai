import * as React from 'react'
import { AlertCircle, AlertTriangle, CheckCircle2, OctagonAlert, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { getRiskBand, type RiskBand, type RiskIconKey } from '@/lib/risk'

const ICONS: Record<RiskIconKey, React.ComponentType<{ className?: string }>> = {
  'shield-check': ShieldCheck,
  'circle-check': CheckCircle2,
  'circle-alert': AlertCircle,
  'triangle-alert': AlertTriangle,
  'octagon-alert': OctagonAlert,
}

export function RiskIcon({ band, className }: { band: RiskBand; className?: string }) {
  const Icon = ICONS[band.icon]
  return <Icon className={cn('size-4', className)} />
}

/**
 * The risk band, shown the only way it is ever allowed to be shown: colour
 * plus an icon plus the words. Strip the colour and it still reads correctly,
 * which is the point — a greyscale printout of a rejection has to be as
 * defensible as the screen it came from.
 */
export function RiskBadge({
  score,
  band: bandProp,
  variant = 'soft',
  size = 'md',
  showVerdict = false,
  className,
}: {
  /** Pass a score, or a band directly if you already resolved it. */
  score?: number
  band?: RiskBand
  variant?: 'soft' | 'solid'
  size?: 'sm' | 'md' | 'lg'
  /** Appends the plain-language verdict, e.g. "Low Risk · Likely to repay". */
  showVerdict?: boolean
  className?: string
}) {
  const band = bandProp ?? getRiskBand(score ?? 0)

  const sizeClass = {
    sm: 'px-2 py-1 text-[11px] gap-1',
    md: 'px-2.5 py-1.5 text-xs gap-1.5',
    lg: 'px-3 py-2 text-sm gap-2',
  }[size]

  const iconSize = { sm: 'size-3', md: 'size-3.5', lg: 'size-4' }[size]

  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center rounded-full font-semibold leading-none',
        variant === 'soft' ? band.softClass : band.solidClass,
        sizeClass,
        className,
      )}
    >
      <RiskIcon band={band} className={cn(iconSize, 'shrink-0')} />
      <span className="truncate">
        {band.label}
        {showVerdict && (
          <span className="font-normal opacity-90"> · {band.verdict}</span>
        )}
      </span>
    </span>
  )
}
