import { Info, Sparkles } from 'lucide-react'
import { ReasonList, ScoreBreakdown } from '@/components/score/reason-cards'
import { ScoreGauge } from '@/components/score/score-gauge'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeaderRow } from '@/components/ui/card'
import type { CustomerFeatures } from '@/lib/features/types'
import { explainScore, summariseScore } from '@/lib/scoring/explain'
import { MODEL_INFO, improvementOpportunities, type CreditScore } from '@/lib/scoring/score'
import { formatDateTime, formatPercent } from '@/lib/utils/format'

/**
 * The complete score panel for the applicant view.
 *
 * Ordered the way a decision actually gets made: the number first, the
 * one-sentence verdict second, then the reasons ranked by how much they moved
 * it, and only then the arithmetic for anyone who wants to check it.
 *
 * On mobile the gauge and the band stay above the fold and the reasons stack
 * beneath in a scrollable list, which is the Phase 3 requirement — a loan
 * officer standing in a shop should get the answer without scrolling, and the
 * justification by scrolling once.
 */
export function ScorePanel({
  score,
  features,
  customerName,
  scoredAt,
}: {
  score: CreditScore
  features: CustomerFeatures
  customerName: string
  scoredAt?: Date
}) {
  const reasons = explainScore(score, features)
  const positives = reasons.filter((r) => r.direction === 'positive')
  const negatives = reasons.filter((r) => r.direction === 'negative')
  const opportunities = improvementOpportunities(features, 3)

  return (
    <div className="flex flex-col gap-5">
      {/* ---------- the number ---------- */}
      <Card>
        <CardContent className="flex flex-col items-center gap-4 p-5 pt-6 sm:p-6 lg:flex-row lg:items-center lg:gap-8">
          <div className="shrink-0">
            <ScoreGauge score={score.score} size="lg" />
          </div>

          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold tracking-tight">
              CreditSense Score
            </h2>
            <p className="mt-2 text-pretty text-sm leading-relaxed text-muted-foreground">
              {summariseScore(score, features, customerName)}
            </p>

            <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-3">
              <div>
                <dt className="text-xs text-muted-foreground">Chance of default</dt>
                <dd className="mt-0.5 font-semibold tabular-nums">
                  {formatPercent(score.probabilityOfDefault)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Positive factors</dt>
                <dd className="mt-0.5 font-semibold tabular-nums text-risk-low">
                  {positives.length}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Concerns</dt>
                <dd className="mt-0.5 font-semibold tabular-nums text-risk-veryhigh">
                  {negatives.length}
                </dd>
              </div>
            </dl>
          </div>
        </CardContent>
      </Card>

      {/* ---------- what counts in their favour ---------- */}
      <Card>
        <CardHeaderRow
          title="What counts in their favour"
          description="Ranked by how much each one lifted the score."
          actions={<Badge tone="success">{positives.length}</Badge>}
        />
        <CardContent>
          <ReasonList
            reasons={positives}
            emptyMessage="Nothing in this record lifts the score meaningfully."
          />
        </CardContent>
      </Card>

      {/* ---------- what counts against ---------- */}
      <Card>
        <CardHeaderRow
          title="What counts against them"
          description="Ranked by how much each one lowered the score."
          actions={<Badge tone="danger">{negatives.length}</Badge>}
        />
        <CardContent>
          <ReasonList
            reasons={negatives}
            emptyMessage="Nothing in this record counts meaningfully against them."
          />
        </CardContent>
      </Card>

      {/* ---------- what would improve it ---------- */}
      {opportunities.length > 0 && (
        <Card>
          <CardHeaderRow
            title="What would improve this score"
            description="Turns a rejection into advice the applicant can act on."
          />
          <CardContent>
            <ul className="flex flex-col gap-3">
              {opportunities.map((item) => (
                <li
                  key={item.key}
                  className="flex items-start justify-between gap-4 rounded-lg border border-border bg-surface-sunken p-3.5"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{item.label}</p>
                    <p className="mt-0.5 text-sm leading-snug text-muted-foreground">
                      Currently {item.currentBin}. Reaching {item.bestBin} would help most.
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-bold tabular-nums text-risk-low">
                    +{item.pointsAvailable}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* ---------- the arithmetic ---------- */}
      <Card>
        <CardHeaderRow
          title="How the score adds up"
          description="Every point is accounted for. Nothing here is an approximation of the model — it is the model."
        />
        <CardContent>
          <ScoreBreakdown
            basePoints={score.basePoints}
            reasons={reasons}
            finalScore={score.score}
          />
        </CardContent>
      </Card>

      {/* ---------- provenance ---------- */}
      <Alert tone="info" icon={<Info />} title="About this score">
        Produced by scorecard v{score.modelVersion}, a logistic regression over{' '}
        {MODEL_INFO.featureCount} behavioural features — not a black box. Every{' '}
        {MODEL_INFO.pointsToDoubleOdds} points halves the chance of default, and 500 is even odds.
        Held-out AUC {MODEL_INFO.metrics.aucTest.toFixed(3)} on{' '}
        {MODEL_INFO.metrics.datasetSize} customers.
        {scoredAt && <> Scored {formatDateTime(scoredAt)}.</>}
        <span className="mt-2 block">
          The model never sees age, gender, city or occupation — only what the applicant did.
        </span>
      </Alert>
    </div>
  )
}

/** A compact score summary for the queue and list views. */
export function ScoreSummaryCard({
  score,
  customerName,
}: {
  score: CreditScore
  customerName: string
}) {
  const top = score.contributions.filter((c) => c.direction !== 'neutral').slice(0, 2)

  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-4 sm:p-5">
        <ScoreGauge score={score.score} size="sm" showScale={false} animate={false} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{customerName}</p>
          <ul className="mt-1.5 space-y-0.5">
            {top.map((c) => (
              <li key={c.key} className="flex items-baseline gap-2 text-xs">
                <span
                  className={
                    c.direction === 'positive'
                      ? 'shrink-0 font-semibold tabular-nums text-risk-low'
                      : 'shrink-0 font-semibold tabular-nums text-risk-veryhigh'
                  }
                >
                  {c.points > 0 ? '+' : '−'}
                  {Math.abs(c.points)}
                </span>
                <span className="truncate text-muted-foreground">{c.label}</span>
              </li>
            ))}
          </ul>
        </div>
        <Sparkles className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </CardContent>
    </Card>
  )
}
