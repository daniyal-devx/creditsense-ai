import { AlertOctagon, AlertTriangle, Eye, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { Alert } from '@/components/ui/alert'
import { Badge, type BadgeTone } from '@/components/ui/badge'
import { Card, CardContent, CardHeaderRow } from '@/components/ui/card'
import type { FraudFlag } from '@/lib/fraud/detectors'
import type { StoredFraudAssessment } from '@/lib/db/fraud'

/**
 * The fraud panel on the applicant view.
 *
 * A framing this component exists to preserve: these are signals for a human,
 * not a verdict. The copy never says "this is fraud" — it says what was found
 * and why it is worth a look. Two brothers sharing a phone produce the same
 * signal as a device farm, and only a person can tell them apart.
 *
 * Every flag shows its evidence, because a flag an analyst cannot check is one
 * they will eventually learn to ignore.
 */

const LEVEL_CONFIG: Record<
  StoredFraudAssessment['level'],
  { label: string; tone: BadgeTone; icon: typeof ShieldCheck; alertTone: 'success' | 'info' | 'warning' | 'danger' }
> = {
  clear: { label: 'No fraud signals', tone: 'success', icon: ShieldCheck, alertTone: 'success' },
  review: { label: 'Minor signals', tone: 'info', icon: Eye, alertTone: 'info' },
  investigate: {
    label: 'Needs investigation',
    tone: 'warning',
    icon: AlertTriangle,
    alertTone: 'warning',
  },
  block: {
    label: 'Do not decide without review',
    tone: 'danger',
    icon: AlertOctagon,
    alertTone: 'danger',
  },
}

const SEVERITY_TONE: Record<FraudFlag['severity'], BadgeTone> = {
  critical: 'danger',
  high: 'danger',
  medium: 'warning',
  low: 'neutral',
}

export function FraudBadge({
  level,
  score,
  size = 'md',
}: {
  level: StoredFraudAssessment['level']
  score?: number
  size?: 'sm' | 'md'
}) {
  const config = LEVEL_CONFIG[level]
  const Icon = config.icon

  return (
    <Badge tone={config.tone} size={size} icon={<Icon />}>
      {config.label}
      {score !== undefined && level !== 'clear' && (
        <span className="ml-1 tabular-nums opacity-80">· {score}</span>
      )}
    </Badge>
  )
}

export function FraudPanel({
  assessment,
  customerName,
  children,
}: {
  assessment: StoredFraudAssessment
  customerName: string
  /** The relationship graph, passed in by the page so this stays a server component. */
  children?: React.ReactNode
}) {
  const firstName = customerName.split(' ')[0]

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardContent className="p-5 sm:p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <FraudBadge level={assessment.level} />
                {assessment.flags.length > 0 && (
                  <span className="text-sm text-muted-foreground">
                    {assessment.flags.length}{' '}
                    {assessment.flags.length === 1 ? 'signal' : 'signals'}
                  </span>
                )}
              </div>
              <p className="mt-3 text-pretty text-sm leading-relaxed text-muted-foreground">
                {assessment.summary}
              </p>
            </div>

            <div className="shrink-0 text-center sm:text-right">
              <p className="text-xs text-muted-foreground">Fraud risk</p>
              <p
                className={cn(
                  'text-4xl font-semibold tabular-nums',
                  assessment.riskScore >= 70
                    ? 'text-risk-veryhigh'
                    : assessment.riskScore >= 45
                      ? 'text-risk-high'
                      : assessment.riskScore >= 20
                        ? 'text-risk-moderate'
                        : 'text-risk-low',
                )}
              >
                {assessment.riskScore}
              </p>
              <p className="text-xs text-muted-foreground">out of 100</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {assessment.level === 'block' && (
        <Alert
          tone="danger"
          icon={<AlertOctagon />}
          title="Hold this application"
        >
          Do not approve or reject {firstName} until a Fraud Analyst has reviewed the signals
          below. Deciding now risks either funding a fraud or declining a genuine applicant on a
          coincidence.
        </Alert>
      )}

      {assessment.flags.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-10 text-center">
            <span className="mb-3 flex size-12 items-center justify-center rounded-full bg-success-soft text-success-soft-foreground">
              <ShieldCheck className="size-6" aria-hidden="true" />
            </span>
            <p className="font-semibold">Nothing flagged</p>
            <p className="mt-1 max-w-sm text-sm leading-relaxed text-muted-foreground">
              Transaction behaviour, device and identity checks all came back clean.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeaderRow
            title="What was found"
            description="Ranked by weight. Each one includes the evidence behind it."
          />
          <CardContent>
            <ul className="flex flex-col gap-3">
              {assessment.flags.map((flag) => (
                <FraudFlagCard key={flag.code} flag={flag} />
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {children}

      <Alert tone="info" title="These are signals, not a verdict">
        Every check here answers &ldquo;is this worth a human looking at?&rdquo; — never &ldquo;is
        this person a criminal&rdquo;. Two brothers sharing a phone produce the same signal as a
        device farm. The decision belongs to a Fraud Analyst, which is why the evidence is shown
        rather than just the conclusion.
      </Alert>
    </div>
  )
}

function FraudFlagCard({ flag }: { flag: FraudFlag }) {
  const evidenceEntries = Object.entries(flag.evidence).filter(
    ([, value]) => value !== null && value !== undefined,
  )

  return (
    <li
      className={cn(
        'rounded-xl border p-4',
        flag.severity === 'critical' || flag.severity === 'high'
          ? 'border-danger/30 bg-danger-soft/30'
          : flag.severity === 'medium'
            ? 'border-warning/30 bg-warning-soft/30'
            : 'border-border bg-surface',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold">{flag.label}</p>
          <Badge tone={SEVERITY_TONE[flag.severity]} size="sm">
            {flag.severity}
          </Badge>
        </div>
        <span className="shrink-0 text-sm font-semibold tabular-nums text-muted-foreground">
          +{flag.points}
        </span>
      </div>

      <p className="mt-2 text-sm leading-relaxed">{flag.finding}</p>

      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{flag.rationale}</p>

      {evidenceEntries.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-medium text-primary underline-offset-4 hover:underline">
            Show the evidence
          </summary>
          <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1.5 rounded-lg bg-surface-sunken p-3 sm:grid-cols-2">
            {evidenceEntries.map(([key, value]) => (
              <div key={key} className="flex items-baseline justify-between gap-3 text-xs">
                <dt className="text-muted-foreground">
                  {key.replace(/([A-Z])/g, ' $1').toLowerCase()}
                </dt>
                <dd className="shrink-0 text-right font-mono">
                  {formatEvidence(value)}
                </dd>
              </div>
            ))}
          </dl>
        </details>
      )}
    </li>
  )
}

function formatEvidence(value: unknown): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return '—'
    if (typeof value[0] === 'object') {
      return value
        .slice(0, 4)
        .map((v) => {
          const entry = v as Record<string, unknown>
          return String(entry.name ?? entry.ref ?? entry.day ?? JSON.stringify(entry))
        })
        .join(', ')
    }
    return value.slice(0, 6).join(', ')
  }
  if (typeof value === 'number') return value.toLocaleString()
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}
