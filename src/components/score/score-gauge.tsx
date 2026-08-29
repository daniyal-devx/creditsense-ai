'use client'

import * as React from 'react'
import { cn } from '@/lib/utils/cn'
import { RISK_BANDS, SCORE_MAX, SCORE_MIN, clampScore, getRiskBand } from '@/lib/risk'
import { RiskIcon } from '@/components/risk/risk-badge'

/**
 * The score gauge — the single most prominent element on the applicant view.
 *
 * Drawn as inline SVG rather than a chart library: it is one arc and a needle,
 * and pulling in a charting runtime for that would cost more kilobytes than
 * the entire rest of the page.
 *
 * Two decisions worth naming:
 *
 *   The five band segments are always visible, coloured, and labelled. A
 *   single sweeping arc would show the score but not what it *means* — the
 *   segments let a loan officer see at a glance that 745 sits near the top of
 *   "Low Risk" rather than scraping into it.
 *
 *   The number, the band name and the icon are all rendered together. Strip
 *   the colour entirely and the gauge still reads correctly, which is the rule
 *   for every risk indicator in this product.
 */

export interface ScoreGaugeProps {
  score: number
  /** `lg` for the applicant view, `sm` for a card or a table row. */
  size?: 'sm' | 'md' | 'lg'
  /** Shows the numeric range labels under the arc. */
  showScale?: boolean
  /** Animates the needle in on mount. */
  animate?: boolean
  className?: string
}

/**
 * A 240° arc with the opening at the bottom.
 *
 * Angles here run 0° = up, 90° = right, 180° = down. Sweeping 240° from 240°
 * covers 240° → 480°(=120°), leaving the gap centred on 180° — the bottom,
 * where a gauge's opening belongs and where the needle can never be ambiguous.
 */
const START_ANGLE = 240
const SWEEP = 240

const SIZES = {
  sm: { box: 128, stroke: 10, scoreText: 'text-2xl', labelText: 'text-[10px]', gap: 2 },
  md: { box: 200, stroke: 15, scoreText: 'text-4xl', labelText: 'text-xs', gap: 2 },
  lg: { box: 260, stroke: 19, scoreText: 'text-4xl sm:text-5xl', labelText: 'text-sm', gap: 1.6 },
}

function polar(cx: number, cy: number, radius: number, degrees: number) {
  const radians = ((degrees - 90) * Math.PI) / 180
  return { x: cx + radius * Math.cos(radians), y: cy + radius * Math.sin(radians) }
}

function arcPath(cx: number, cy: number, radius: number, from: number, to: number): string {
  const start = polar(cx, cy, radius, to)
  const end = polar(cx, cy, radius, from)
  const largeArc = to - from <= 180 ? 0 : 1
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 0 ${end.x} ${end.y}`
}

export function ScoreGauge({
  score: rawScore,
  size = 'lg',
  showScale = true,
  animate = true,
  className,
}: ScoreGaugeProps) {
  const score = clampScore(rawScore)
  const band = getRiskBand(score)
  const config = SIZES[size]

  const box = config.box
  const centre = box / 2
  const radius = centre - config.stroke / 2 - 2

  // Count up to the score so the eye follows the needle rather than having the
  // final number appear from nowhere.
  const [displayed, setDisplayed] = React.useState(animate ? SCORE_MIN : score)

  React.useEffect(() => {
    // Reduced motion and `animate={false}` are handled by running the same
    // animation with a zero duration, so it lands on the final value on the
    // first frame. Calling setState directly in the effect body instead would
    // trigger the cascading re-render React's lint rules exist to prevent.
    const instant =
      !animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const durationMs = instant ? 0 : 900

    let frame: number
    const startedAt = performance.now()

    const step = (now: number) => {
      const t = durationMs === 0 ? 1 : Math.min(1, (now - startedAt) / durationMs)
      // Ease-out cubic: fast then settling, which reads as a measurement
      // arriving rather than a progress bar filling.
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplayed(Math.round(score * eased))
      if (t < 1) frame = requestAnimationFrame(step)
    }

    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [score, animate])

  const needleAngle = START_ANGLE + (score / SCORE_MAX) * SWEEP

  return (
    <div className={cn('flex w-full flex-col items-center', className)}>
      {/*
        Fluid width with a cap rather than a fixed pixel box. At 320px the
        available width inside a card is about 248px, so a hard 260px gauge
        would push the page sideways — and "no horizontal scrolling, ever" is a
        rule of this product. The SVG scales through its viewBox and the
        overlay is positioned in percentages so it tracks the scaling.
      */}
      <div
        className="relative w-full"
        style={{ maxWidth: box, aspectRatio: `${box} / ${box * 0.78}` }}
      >
        <svg
          viewBox={`0 0 ${box} ${box}`}
          className="absolute inset-x-0 top-0 h-auto w-full"
          role="img"
          aria-label={`CreditSense score ${score} out of 1000. ${band.label}: ${band.verdict}.`}
        >
          {/* Band segments, worst on the left through best on the right. */}
          {[...RISK_BANDS].reverse().map((b) => {
            const from = START_ANGLE + (b.min / SCORE_MAX) * SWEEP
            const to = START_ANGLE + ((b.max + 1) / SCORE_MAX) * SWEEP
            const isCurrent = b.id === band.id
            return (
              <path
                key={b.id}
                d={arcPath(centre, centre, radius, from + config.gap, to - config.gap)}
                fill="none"
                stroke={b.cssVar}
                strokeWidth={isCurrent ? config.stroke + 3 : config.stroke}
                strokeLinecap="round"
                // The band the applicant is in is fully saturated; the rest
                // recede so the eye lands on the right one immediately.
                opacity={isCurrent ? 1 : 0.22}
                className="transition-opacity duration-500"
              />
            )
          })}

          {/* Needle */}
          <g
            style={{
              transform: `rotate(${needleAngle}deg)`,
              transformOrigin: `${centre}px ${centre}px`,
              transition: animate ? 'transform 900ms cubic-bezier(0.22, 1, 0.36, 1)' : undefined,
            }}
          >
            <line
              x1={centre}
              y1={centre}
              x2={centre}
              y2={centre - radius + config.stroke * 0.9}
              stroke="var(--foreground)"
              strokeWidth={size === 'sm' ? 2 : 3}
              strokeLinecap="round"
            />
          </g>
          <circle
            cx={centre}
            cy={centre}
            r={size === 'sm' ? 4 : 6}
            fill="var(--surface)"
            stroke="var(--foreground)"
            strokeWidth={size === 'sm' ? 2 : 2.5}
          />
        </svg>

        {/* The number, centred inside the arc. Positioned as a percentage of
            the container so it stays put as the gauge scales down. */}
        <div className="absolute inset-x-0 flex flex-col items-center" style={{ top: '38%' }}>
          <span className={cn('font-semibold leading-none tabular-nums', config.scoreText)}>
            {displayed}
          </span>
          <span className={cn('mt-1 text-muted-foreground', config.labelText)}>
            out of {SCORE_MAX}
          </span>
        </div>
      </div>

      {/* Band, always as colour + icon + words. */}
      <div
        className={cn(
          'mt-1 flex items-center gap-2 rounded-full px-3 py-1.5 font-semibold',
          band.softClass,
          size === 'sm' ? 'text-xs' : 'text-sm',
        )}
      >
        <RiskIcon band={band} className={size === 'sm' ? 'size-3.5' : 'size-4'} />
        {band.label}
      </div>

      {size !== 'sm' && (
        <p className="mt-2 text-pretty text-center text-sm text-muted-foreground">
          {band.verdict}
        </p>
      )}

      {showScale && (
        <div
          className="mt-3 flex w-full justify-between text-xs tabular-nums text-muted-foreground"
          style={{ maxWidth: box }}
          aria-hidden="true"
        >
          <span>{SCORE_MIN}</span>
          <span>500</span>
          <span>{SCORE_MAX}</span>
        </div>
      )}
    </div>
  )
}

/**
 * A compact horizontal score bar for tables and dense lists, where a gauge
 * would be unreadable at the size available.
 */
export function ScoreBar({ score: rawScore, className }: { score: number; className?: string }) {
  const score = clampScore(rawScore)
  const band = getRiskBand(score)
  const position = (score / SCORE_MAX) * 100

  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <span className="w-10 shrink-0 text-sm font-semibold tabular-nums">{score}</span>
      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${position}%`, backgroundColor: band.cssVar }}
        />
      </div>
    </div>
  )
}
