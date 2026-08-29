import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  AlertOctagon,
  CheckCircle2,
  ExternalLink,
  FileText,
  ShieldCheck,
  XCircle,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { AffordabilityPanel } from '@/components/affordability/affordability-panel'
import { DecisionBar, ReadOnlyDecisionNotice } from '@/components/decision/decision-bar'
import { FraudBadge, FraudPanel } from '@/components/fraud/fraud-panel'
import { RiskBadge } from '@/components/risk/risk-badge'
import { ScorePanel } from '@/components/score/score-panel'
import { BillTimeline } from '@/components/signals/bill-timeline'
import { CashflowChart } from '@/components/signals/cashflow-chart'
import { Alert } from '@/components/ui/alert'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeaderRow } from '@/components/ui/card'
import { requirePermission } from '@/lib/auth/guard'
import { ROLE_DEFINITIONS, can } from '@/lib/auth/roles'
import { assessAffordability } from '@/lib/affordability/engine'
import { getApplication } from '@/lib/db/applications'
import { getBillHistory, getCustomer, getCustomerFeatures } from '@/lib/db/customers'
import { getFraudAssessment } from '@/lib/db/fraud'
import { getAlertsForCustomer } from '@/lib/db/monitoring'
import { fullFeaturesToModelInput } from '@/lib/db/scores'
import { scoreCustomer } from '@/lib/scoring/score'
import { formatDate, formatDateTime, formatPKR, titleFromSlug } from '@/lib/utils/format'
import { DecisionPanels } from './decision-tabs'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const application = await getApplication(id)
  return { title: application ? `${application.reference} — ${application.fullName}` : 'Application' }
}

/**
 * The decision screen.
 *
 * Phase 7's whole point: the four modules stop being separate analyses here and
 * become one approve/reject. Everything on this page exists to answer a single
 * question — should this person get this money — and the action bar is never
 * more than a thumb away.
 */
export default async function ApplicationDecisionPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await requirePermission('applications:read')

  const { id } = await params
  const application = await getApplication(id)
  if (!application) notFound()

  const [customer, features, fraud, alerts, bills] = await Promise.all([
    getCustomer(application.customerId),
    getCustomerFeatures(application.customerId),
    getFraudAssessment(application.customerId),
    getAlertsForCustomer(application.customerId),
    getBillHistory(application.customerId, 60),
  ])

  if (!customer) notFound()

  const modelFeatures = features ? fullFeaturesToModelInput(features) : null
  const scored = modelFeatures ? scoreCustomer(modelFeatures) : null

  const affordability =
    scored && modelFeatures
      ? assessAffordability({
          features: modelFeatures,
          score: scored,
          requestedAmount: application.requestedAmount,
          requestedTenorMonths: application.requestedTenorMonths,
        })
      : null

  const canDecide = can(user.role, 'applications:decide')
  const isDecided = application.status === 'approved' || application.status === 'rejected'
  const fraudBlocked = fraud?.level === 'block'

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Applications', href: '/applications' },
          { label: application.reference },
        ]}
        title={
          <span className="flex items-center gap-3">
            <Avatar name={application.fullName} size="lg" className="hidden sm:inline-flex" />
            <span>{application.fullName}</span>
          </span>
        }
        description={`${application.occupation} · ${application.city} · applied ${formatDate(application.submittedAt)}`}
        badge={
          <span className="flex flex-wrap items-center gap-2">
            {scored && <RiskBadge score={scored.score} showVerdict />}
            {fraud && fraud.level !== 'clear' && (
              <FraudBadge level={fraud.level} score={fraud.riskScore} />
            )}
            {!customer.hasBankLoanHistory && <Badge tone="primary">Thin file</Badge>}
          </span>
        }
        actions={
          <Link
            href={`/customers/${application.customerId}`}
            className={buttonVariants({ variant: 'secondary' })}
          >
            Full signal profile
            <ExternalLink className="ml-2 size-4" aria-hidden="true" />
          </Link>
        }
      />

      <div className="flex flex-col gap-6">
        {/* ---------- the ask ---------- */}
        <Card>
          <CardContent className="p-4 pt-4 sm:p-5 sm:pt-5">
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <dt className="text-xs text-muted-foreground">Requested</dt>
                <dd className="mt-0.5 text-lg font-semibold tabular-nums">
                  {formatPKR(application.requestedAmount)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Over</dt>
                <dd className="mt-0.5 text-lg font-semibold tabular-nums">
                  {application.requestedTenorMonths} months
                </dd>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <dt className="text-xs text-muted-foreground">Purpose</dt>
                <dd className="mt-0.5 text-sm font-medium">{application.purpose}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Channel</dt>
                <dd className="mt-0.5 text-sm font-medium">
                  {titleFromSlug(application.channel)}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        {/* ---------- already decided ---------- */}
        {isDecided && (
          <Alert
            tone={application.status === 'approved' ? 'success' : 'danger'}
            icon={application.status === 'approved' ? <CheckCircle2 /> : <XCircle />}
            title={`Already ${application.status} — ${formatDateTime(application.decidedAt!)}`}
          >
            <span className="block">
              Decided by {application.decidedByEmail ?? 'an unknown user'}.
            </span>
            {application.decisionNotes && (
              <span className="mt-2 block rounded-lg bg-surface p-3 text-sm">
                &ldquo;{application.decisionNotes}&rdquo;
              </span>
            )}
          </Alert>
        )}

        {/* ---------- the recommendation ---------- */}
        {affordability && scored && !isDecided && (
          <Recommendation
            fraudBlocked={fraudBlocked}
            band={scored.band.id}
            requested={application.requestedAmount}
            recommended={affordability.recommendedAmount}
            decision={affordability.decision}
            applicantName={application.fullName}
          />
        )}

        {/* ---------- the four modules ---------- */}
        {scored && modelFeatures && affordability ? (
          <DecisionPanels
            fraudFlagCount={fraud?.flags.length ?? 0}
            alertCount={alerts.length}
            score={
              <ScorePanel
                score={scored}
                features={modelFeatures}
                customerName={application.fullName}
              />
            }
            affordability={
              <AffordabilityPanel
                assessment={affordability}
                customerName={application.fullName}
              />
            }
            fraud={
              fraud ? (
                <FraudPanel assessment={fraud} customerName={application.fullName}>
                  <Link
                    href={`/fraud/${application.customerId}`}
                    className={buttonVariants({ variant: 'secondary', fullWidth: true })}
                  >
                    Open the relationship graph
                  </Link>
                </FraudPanel>
              ) : (
                <Card>
                  <CardContent className="flex flex-col items-center py-10 text-center">
                    <ShieldCheck className="mb-3 size-8 text-muted-foreground" aria-hidden="true" />
                    <p className="font-semibold">No fraud assessment</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Run <code className="font-mono text-xs">npm run db:fraud</code>.
                    </p>
                  </CardContent>
                </Card>
              )
            }
            history={
              <div className="flex flex-col gap-5">
                {alerts.length > 0 && (
                  <Alert tone="warning" title={`${alerts.length} open monitoring alert${alerts.length === 1 ? '' : 's'}`}>
                    <ul className="mt-1 list-disc space-y-1 pl-5">
                      {alerts.slice(0, 4).map((alert) => (
                        <li key={alert.alertId}>{alert.title}</li>
                      ))}
                    </ul>
                  </Alert>
                )}

                <Card>
                  <CardHeaderRow
                    title="Money in, month by month"
                    description="Income excludes transfers and refunds — money arriving is not money earned."
                  />
                  <CardContent>
                    <CashflowChart buckets={features?.monthlyBuckets ?? []} />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeaderRow
                    title="Utility bill record"
                    description="The closest thing a thin-file applicant has to a repayment history."
                  />
                  <CardContent>
                    <BillTimeline bills={bills} />
                  </CardContent>
                </Card>
              </div>
            }
          />
        ) : (
          <Alert tone="warning" title="This applicant has not been assessed">
            No engineered features exist for them, so no score or affordability figure could be
            produced. Run{' '}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
              npm run db:features
            </code>{' '}
            then{' '}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">npm run db:score</code>
            .
          </Alert>
        )}

        {/* ---------- the decision ---------- */}
        {!isDecided &&
          (canDecide ? (
            <DecisionBar
              applicationId={application.id}
              applicantName={application.fullName}
              requestedAmount={application.requestedAmount}
              requestedTenorMonths={application.requestedTenorMonths}
              recommendedAmount={affordability?.recommendedAmount ?? null}
              recommendedTenorMonths={affordability?.recommendedTenorMonths ?? null}
              fraudBlocked={fraudBlocked}
              evidence={{
                score: scored?.score ?? null,
                band: scored?.band.id ?? null,
                fraudLevel: fraud?.level ?? null,
                recommendedAmount: affordability?.recommendedAmount ?? null,
              }}
            />
          ) : (
            <ReadOnlyDecisionNotice roleLabel={ROLE_DEFINITIONS[user.role].label} />
          ))}
      </div>
    </>
  )
}

/**
 * The one-line recommendation, above the detail.
 *
 * A loan officer working a queue of fifty needs the straightforward cases to
 * be obviously straightforward. This states the system's view plainly and then
 * gets out of the way — it never decides, and the wording avoids implying it
 * has.
 */
function Recommendation({
  fraudBlocked,
  band,
  requested,
  recommended,
  decision,
  applicantName,
}: {
  fraudBlocked: boolean
  band: string
  requested: number
  recommended: number
  decision: string
  applicantName: string
}) {
  const firstName = applicantName.split(' ')[0]

  if (fraudBlocked) {
    return (
      <Alert tone="danger" icon={<AlertOctagon />} title="Hold — fraud review required">
        FraudSense has flagged this application. Do not approve it until a Fraud Analyst has
        cleared the signals. It can still be rejected or sent to review.
      </Alert>
    )
  }

  if (decision === 'not_affordable') {
    return (
      <Alert tone="danger" icon={<XCircle />} title="No safe loan amount">
        {firstName}&apos;s cash flow cannot support an instalment large enough to be worth
        originating.
      </Alert>
    )
  }

  const isRisky = band === 'high' || band === 'very-high'

  if (isRisky) {
    return (
      <Alert tone="warning" icon={<FileText />} title="Read the detail before deciding">
        The score puts {firstName} in a higher risk band. Affordability supports up to{' '}
        {formatPKR(recommended)} — but the reasons behind the score matter more than the number
        here.
      </Alert>
    )
  }

  if (recommended >= requested) {
    return (
      <Alert
        tone="success"
        icon={<CheckCircle2 />}
        title={`The full ${formatPKR(requested)} is supportable`}
      >
        {firstName} scores well and the requested amount sits inside the safe affordability
        ceiling of {formatPKR(recommended)}.
      </Alert>
    )
  }

  return (
    <Alert
      tone="warning"
      icon={<FileText />}
      title={`Consider approving ${formatPKR(recommended)} rather than ${formatPKR(requested)}`}
    >
      The score is acceptable, but the full amount would push the instalment past what{' '}
      {firstName}&apos;s income can carry in a quiet month.
    </Alert>
  )
}
