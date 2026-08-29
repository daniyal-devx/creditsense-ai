import { Minus, TrendingDown, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { InfoTip } from '@/components/ui/tooltip'
import type { ScoreReason } from '@/lib/scoring/explain'

/**
 * The reason cards.
 *
 * Each contributing factor as a sentence a loan officer could read aloud to
 * the applicant, ranked by how much it actually moved the score.
 *
 * The points figure matters more than it looks. Without it, every reason
 * appears equally important and the officer has no way to tell a decisive
 * factor from a marginal one — which is precisely the judgement they need to
 * make. With it, "+62 because they paid every bill on time" and "−8 because
 * they mostly use cash" are visibly different arguments.
 *
 * Direction is carried three ways at once: an icon, a signed number, and the
 * words. Colour is the fourth, and the only one that can be lost.
 */

export function ReasonCard({ reason }: { reason: ScoreReason }) {
  const Icon =
    reason.direction === 'positive'
      ? TrendingUp
      : reason.direction === 'negative'
        ? TrendingDown
        : Minus

  const tone =
    reason.direction === 'positive'
      ? {
          wrap: 'border-risk-low/30 bg-risk-low-soft/40',
          icon: 'bg-risk-low-soft text-risk-low-on-soft',
          points: 'text-risk-low',
        }
      : reason.direction === 'negative'
        ? {
            wrap: 'border-risk-veryhigh/30 bg-risk-veryhigh-soft/40',
            icon: 'bg-risk-veryhigh-soft text-risk-veryhigh-on-soft',
            points: 'text-risk-veryhigh',
          }
        : {
            wrap: 'border-border bg-surface',
            icon: 'bg-muted text-muted-foreground',
            points: 'text-muted-foreground',
          }

  return (
    <li className={cn('flex gap-3 rounded-xl border p-3.5 sm:p-4', tone.wrap)}>
      <span
        className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg', tone.icon)}
        aria-hidden="true"
      >
        <Icon className="size-4" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-semibold leading-snug">{reason.headline}</p>
          <span
            className={cn('shrink-0 text-sm font-bold tabular-nums', tone.points)}
            aria-label={`${reason.points >= 0 ? 'adds' : 'removes'} ${Math.abs(reason.points)} points`}
          >
            {reason.points > 0 ? '+' : reason.points < 0 ? '−' : ''}
            {Math.abs(reason.points)}
          </span>
        </div>

        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{reason.sentence}</p>
      </div>

      <span className="shrink-0 self-start">
        <InfoTip label={`About ${reason.headline}`} content={reason.detail} />
      </span>
    </li>
  )
}

export function ReasonList({
  reasons,
  emptyMessage = 'No factors of this kind.',
  className,
}: {
  reasons: ScoreReason[]
  emptyMessage?: string
  className?: string
}) {
  if (reasons.length === 0) {
    return <p className={cn('py-4 text-sm text-muted-foreground', className)}>{emptyMessage}</p>
  }

  return (
    <ul className={cn('flex flex-col gap-2.5', className)}>
      {reasons.map((reason) => (
        <ReasonCard key={reason.key} reason={reason} />
      ))}
    </ul>
  )
}

/**
 * How the score was built up, as an arithmetic breakdown.
 *
 * Every applicant starts from the same base and the contributions add to the
 * final number exactly. That is not a presentational nicety — it is the reason
 * a scorecard was chosen over a black box, and showing the sum makes the claim
 * checkable rather than asserted.
 */
export function ScoreBreakdown({
  basePoints,
  reasons,
  finalScore,
  className,
}: {
  basePoints: number
  reasons: ScoreReason[]
  finalScore: number
  className?: string
}) {
  const moved = reasons.filter((r) => r.points !== 0)
  const sum = basePoints + moved.reduce((total, r) => total + r.points, 0)
  // Clamped to 0–1000, so an extreme profile can differ from the raw sum.
  const wasClamped = sum !== finalScore

  return (
    <div className={cn('text-sm', className)}>
      <dl className="divide-y divide-border">
        <div className="flex items-baseline justify-between gap-4 py-2.5">
          <dt className="text-muted-foreground">Starting point, before any behaviour</dt>
          <dd className="shrink-0 font-medium tabular-nums">{basePoints}</dd>
        </div>

        {moved.map((reason) => (
          <div key={reason.key} className="flex items-baseline justify-between gap-4 py-2.5">
            <dt className="min-w-0 text-muted-foreground">{reason.headline}</dt>
            <dd
              className={cn(
                'shrink-0 font-medium tabular-nums',
                reason.points > 0 ? 'text-risk-low' : 'text-risk-veryhigh',
              )}
            >
              {reason.points > 0 ? '+' : '−'}
              {Math.abs(reason.points)}
            </dd>
          </div>
        ))}

        <div className="flex items-baseline justify-between gap-4 border-t-2 border-border pt-3">
          <dt className="font-semibold">CreditSense Score</dt>
          <dd className="shrink-0 text-lg font-bold tabular-nums">{finalScore}</dd>
        </div>
      </dl>

      {wasClamped && (
        <p className="mt-2 text-xs text-muted-foreground">
          The raw total came to {sum}; the score is capped to the 0–1000 range.
        </p>
      )}
    </div>
  )
}
