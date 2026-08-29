'use client'

import * as React from 'react'
import { AlertTriangle, ArrowRight, Check, Info, Lock } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeaderRow } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { InfoTip } from '@/components/ui/tooltip'
import type { AffordabilityAssessment } from '@/lib/affordability/engine'
import { tenorOptions } from '@/lib/affordability/engine'
import { formatPKR, formatPercent } from '@/lib/utils/format'

/**
 * The affordability panel.
 *
 * Answers Q2 with a specific number rather than a rating, and shows the
 * arithmetic that produced it — because "we can offer you Rs 85,000" is only
 * useful to a loan officer if they can also say why not Rs 120,000.
 *
 * The single most important line on this panel is the stressed income. A loan
 * officer who takes away only one idea should take away that the instalment
 * was sized against a bad month, not an average one.
 */
export function AffordabilityPanel({
  assessment,
  customerName,
}: {
  assessment: AffordabilityAssessment
  customerName: string
}) {
  const firstName = customerName.split(' ')[0]

  const decisionTone =
    assessment.decision === 'affordable'
      ? 'success'
      : assessment.decision === 'reduced'
        ? 'warning'
        : 'danger'

  return (
    <div className="flex flex-col gap-5">
      {/* ---------- the offer ---------- */}
      <Card>
        <CardContent className="p-5 sm:p-6">
          {assessment.decision === 'not_affordable' ? (
            <div className="flex flex-col items-center py-4 text-center">
              <span className="mb-3 flex size-12 items-center justify-center rounded-full bg-danger-soft text-danger-soft-foreground">
                <Lock className="size-6" aria-hidden="true" />
              </span>
              <p className="text-lg font-semibold">No safe loan amount</p>
              <p className="mt-1.5 max-w-sm text-pretty text-sm leading-relaxed text-muted-foreground">
                {firstName}&apos;s cash flow cannot support an instalment large enough to be worth
                originating.
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    Safe loan amount
                    <InfoTip
                      label="How is the safe amount calculated?"
                      content="The largest loan whose instalment fits inside a bad month's income after existing commitments, with a safety margin held back."
                    />
                  </p>
                  <p className="mt-1 text-4xl font-semibold tabular-nums sm:text-5xl">
                    {formatPKR(assessment.recommendedAmount)}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    over {assessment.recommendedTenorMonths} months at{' '}
                    {formatPercent(assessment.annualRate, { decimals: 0 })} a year
                  </p>
                </div>

                <div className="shrink-0 rounded-xl border border-border bg-surface-sunken p-4 sm:min-w-52">
                  <p className="text-sm text-muted-foreground">Monthly instalment</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">
                    {formatPKR(assessment.recommendedInstalment)}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {formatPercent(assessment.debtServiceRatio, { decimals: 0 })} of a bad
                    month&apos;s income
                  </p>
                </div>
              </div>

              <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-border pt-5 sm:grid-cols-4">
                <Figure label="Total repayable" value={formatPKR(assessment.totalRepayable)} />
                <Figure label="Total interest" value={formatPKR(assessment.totalInterest)} />
                <Figure
                  label="Absolute ceiling"
                  value={formatPKR(assessment.maximumAmount)}
                  hint="Before the safety margin"
                />
                <Figure
                  label="Limited by"
                  value={assessment.bindingConstraint}
                  small
                />
              </dl>
            </>
          )}
        </CardContent>
      </Card>

      {/* ---------- requested vs recommended ---------- */}
      {assessment.requestedVsRecommended && assessment.requestedVsRecommended.shortfall > 0 && (
        <Alert
          tone={decisionTone === 'danger' ? 'danger' : 'warning'}
          title={`Asked for ${formatPKR(assessment.requestedVsRecommended.requested)}, we can safely offer ${formatPKR(assessment.requestedVsRecommended.recommended)}`}
        >
          That is {formatPKR(assessment.requestedVsRecommended.shortfall)} less than requested.
          Approving the full amount would push the instalment past what{' '}
          {firstName}&apos;s income can carry in a quiet month.
        </Alert>
      )}

      {assessment.requestedVsRecommended &&
        assessment.requestedVsRecommended.shortfall === 0 &&
        assessment.decision === 'affordable' && (
          <Alert tone="success" icon={<Check />} title="The full requested amount is affordable">
            {firstName} asked for{' '}
            {formatPKR(assessment.requestedVsRecommended.requested)}, which sits inside the safe
            ceiling of {formatPKR(assessment.recommendedAmount)}.
          </Alert>
        )}

      {/* ---------- how we got there ---------- */}
      <Card>
        <CardHeaderRow
          title="How the amount was calculated"
          description="Every step, so the offer can be explained rather than just quoted."
        />
        <CardContent className="flex flex-col gap-5">
          <IncomeWaterfall assessment={assessment} />

          <ol className="flex flex-col gap-3 border-t border-border pt-5">
            {assessment.reasoning.map((step, i) => (
              <li key={i} className="flex gap-3">
                <span
                  className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary-soft-foreground"
                  aria-hidden="true"
                >
                  {i + 1}
                </span>
                <p className="text-sm leading-relaxed text-muted-foreground">{step}</p>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      {/* ---------- the rules ---------- */}
      <Card>
        <CardHeaderRow
          title="Affordability rules applied"
          description="The lowest ceiling wins. That rule is the binding constraint."
        />
        <CardContent>
          <ul className="flex flex-col gap-2.5">
            {[...assessment.constraints]
              .sort((a, b) => a.amountCeiling - b.amountCeiling)
              .map((constraint) => (
                <li
                  key={constraint.id}
                  className={cn(
                    'flex gap-3 rounded-lg border p-3.5',
                    constraint.binding
                      ? 'border-warning/40 bg-warning-soft/40'
                      : 'border-border bg-surface',
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold">{constraint.label}</p>
                      {constraint.binding && (
                        <Badge tone="warning" size="sm">
                          Binding
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      {constraint.explanation}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs text-muted-foreground">This rule allows</p>
                    <p className="text-sm font-semibold tabular-nums">
                      {formatPKR(constraint.amountCeiling)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatPKR(constraint.instalmentCeiling)}/mo
                    </p>
                  </div>
                </li>
              ))}
          </ul>
        </CardContent>
      </Card>

      {/* ---------- tenor comparison ---------- */}
      {assessment.decision !== 'not_affordable' && (
        <Card>
          <CardHeaderRow
            title="Other terms at the same instalment"
            description="A longer term lends more but keeps them exposed for longer and costs more in interest."
          />
          <CardContent>
            <TenorTable assessment={assessment} />
          </CardContent>
        </Card>
      )}

      {/* ---------- warnings ---------- */}
      {assessment.warnings.length > 0 && (
        <Alert tone="warning" icon={<AlertTriangle />} title="Things to weigh before deciding">
          <ul className="mt-1 list-disc space-y-1.5 pl-5">
            {assessment.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </Alert>
      )}

      <Alert tone="info" icon={<Info />} title="Why a bad month, not an average one">
        An informal worker&apos;s average month is a figure they cannot pay an instalment out of.
        The quiet month is the one that causes a default, so that is the month the loan has to
        survive. Someone with steady income is barely discounted; someone whose income swings is
        discounted hard — which sizes the loan rather than refusing it.
      </Alert>
    </div>
  )
}

function Figure({
  label,
  value,
  hint,
  small,
}: {
  label: string
  value: string
  hint?: string
  small?: boolean
}) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-xs text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          'mt-0.5 font-semibold tabular-nums',
          small ? 'text-sm' : 'text-base sm:text-lg',
        )}
      >
        {value}
      </dd>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

/**
 * Average income stepping down to what is actually available.
 *
 * A waterfall rather than four separate figures, because the *fall* is the
 * point: seeing 96,000 become 41,000 explains the offer far better than the
 * final number alone.
 */
function IncomeWaterfall({ assessment }: { assessment: AffordabilityAssessment }) {
  const steps = [
    {
      label: 'Average monthly income',
      value: assessment.averageMonthlyIncome,
      tone: 'bg-chart-3',
      note: 'What they earn in a typical month',
    },
    {
      label: 'Income we underwrite against',
      value: assessment.stressedMonthlyIncome,
      tone: 'bg-chart-2',
      note: 'Discounted for how much their income swings',
    },
    {
      label: 'After existing commitments',
      value: assessment.disposableIncome,
      tone: 'bg-chart-4',
      note: 'Utilities and any existing loan instalments removed',
    },
    {
      label: 'Proposed instalment',
      value: assessment.recommendedInstalment,
      tone: 'bg-primary',
      note: 'What is left is their buffer',
    },
  ]

  const max = Math.max(...steps.map((s) => s.value), 1)

  return (
    <div className="flex flex-col gap-3.5">
      {steps.map((step) => (
        <div key={step.label}>
          <div className="flex items-baseline justify-between gap-3">
            <p className="truncate text-sm font-medium">{step.label}</p>
            <p className="shrink-0 text-sm font-semibold tabular-nums">{formatPKR(step.value)}</p>
          </div>
          <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn('h-full rounded-full transition-[width] duration-500', step.tone)}
              style={{ width: `${Math.max(1, (step.value / max) * 100)}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{step.note}</p>
        </div>
      ))}
    </div>
  )
}

function TenorTable({ assessment }: { assessment: AffordabilityAssessment }) {
  // Computed by the engine, not here, so the amount caps are applied at every
  // tenor rather than only at the recommended one.
  const rows = tenorOptions(assessment).map((row) => ({
    ...row,
    isRecommended: row.months === assessment.recommendedTenorMonths,
  }))

  return (
    <ul className="flex flex-col gap-2">
      {rows.map((row) => (
        <li
          key={row.months}
          className={cn(
            'flex items-center gap-3 rounded-lg border p-3',
            row.isRecommended ? 'border-primary bg-primary-soft/40' : 'border-border',
          )}
        >
          <span className="w-16 shrink-0 text-sm font-medium tabular-nums">
            {row.months} mo
          </span>

          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold tabular-nums">{formatPKR(row.amount)}</p>
            <p className="text-xs text-muted-foreground">
              {formatPKR(row.instalment)}/mo · {formatPKR(row.totalInterest)} interest
            </p>
          </div>

          {row.isRecommended && (
            <Badge tone="primary" size="sm" icon={<ArrowRight />}>
              Recommended
            </Badge>
          )}
        </li>
      ))}
    </ul>
  )
}

/** A compact affordability summary for the queue and list views. */
export function AffordabilitySummary({ assessment }: { assessment: AffordabilityAssessment }) {
  if (assessment.decision === 'not_affordable') {
    return (
      <div className="flex items-center gap-2">
        <Badge tone="danger" size="sm" icon={<Lock />}>
          No safe amount
        </Badge>
      </div>
    )
  }

  return (
    <div className="min-w-0">
      <p className="text-sm font-semibold tabular-nums">
        {formatPKR(assessment.recommendedAmount)}
      </p>
      <p className="truncate text-xs text-muted-foreground">
        {formatPKR(assessment.recommendedInstalment)}/mo ×{' '}
        {assessment.recommendedTenorMonths}
      </p>
      <Progress
        label="Instalment against a bad month's income"
        showLabel={false}
        value={Math.min(100, assessment.debtServiceRatio * 100)}
        tone={
          assessment.debtServiceRatio > 0.3
            ? 'warning'
            : assessment.debtServiceRatio > 0.2
              ? 'info'
              : 'success'
        }
        size="sm"
        className="mt-1.5"
      />
    </div>
  )
}
