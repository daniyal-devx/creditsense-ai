import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarDays,
  CreditCard,
  Info,
  MapPin,
  Phone,
  Smartphone,
  Wallet,
} from 'lucide-react'
import { PageHeader, Section } from '@/components/layout/page-header'
import { BillTimeline } from '@/components/signals/bill-timeline'
import { CashflowChart } from '@/components/signals/cashflow-chart'
import { SignalGrid, SignalStat } from '@/components/signals/signal-stat'
import { Alert } from '@/components/ui/alert'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeaderRow } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import {
  getBillHistory,
  getCustomer,
  getCustomerFeatures,
  getMonthlySeriesFromRaw,
  getRecentTransactions,
  getTopupHistory,
} from '@/lib/db/customers'
import { fullFeaturesToModelInput, getCurrentScore } from '@/lib/db/scores'
import { assessAffordability } from '@/lib/affordability/engine'
import { AffordabilityPanel } from '@/components/affordability/affordability-panel'
import { getFraudAssessment } from '@/lib/db/fraud'
import { FraudBadge, FraudPanel } from '@/components/fraud/fraud-panel'
import { buttonVariants } from '@/components/ui/button'
import Link from 'next/link'
import { scoreCustomer } from '@/lib/scoring/score'
import { ScorePanel } from '@/components/score/score-panel'
import { RiskBadge } from '@/components/risk/risk-badge'
import { readAllSignals, summariseProfile } from '@/lib/features/interpret'
import {
  formatDate,
  formatDateTime,
  formatPKR,
  formatPercent,
  maskCNIC,
  formatPhone,
  titleFromSlug,
} from '@/lib/utils/format'
import { cn } from '@/lib/utils/cn'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const customer = await getCustomer(id)
  return { title: customer?.fullName ?? 'Customer' }
}

/**
 * The digital signal profile.
 *
 * Phase 1's "done when": an applicant with zero bank loan history arrives here
 * with a rich, readable behavioural record. Phase 3 adds the score and Phase 4
 * the affordability panel on top of exactly this data.
 */
export default async function CustomerProfilePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const customer = await getCustomer(id)
  if (!customer) notFound()

  const [features, bills, transactions, topups, storedScore, fraud] = await Promise.all([
    getCustomerFeatures(id),
    getBillHistory(id, 60),
    getRecentTransactions(id, 40),
    getTopupHistory(id, 12),
    getCurrentScore(id),
    getFraudAssessment(id),
  ])

  // The scorecard is pure and fast, so the score is recomputed here from the
  // stored features rather than trusting the cached number. The stored row is
  // still the record of what was decided and when — this just guarantees the
  // panel, the contributions and the arithmetic all come from one evaluation.
  const scored = features ? scoreCustomer(fullFeaturesToModelInput(features)) : null
  const modelFeatures = features ? fullFeaturesToModelInput(features) : null

  // Affordability is a separate calculation on the same signals. A score says
  // whether they will repay; it says nothing about how much — and conflating
  // the two over-lends to high scorers and refuses moderate ones outright.
  const affordability =
    scored && modelFeatures
      ? assessAffordability({ features: modelFeatures, score: scored })
      : null

  // The features cache may not have been built yet; the chart still works
  // straight from raw transactions rather than showing an empty panel.
  const buckets =
    features && features.monthlyBuckets.length > 0
      ? features.monthlyBuckets
      : await getMonthlySeriesFromRaw(id, 12)

  const readings = features ? readAllSignals(features) : []

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Customers', href: '/customers' },
          { label: customer.fullName },
        ]}
        title={
          <span className="flex items-center gap-3">
            <Avatar name={customer.fullName} size="lg" className="hidden sm:inline-flex" />
            <span>{customer.fullName}</span>
          </span>
        }
        description={`${customer.occupation} · ${customer.city}, ${customer.province}`}
        badge={
          <span className="flex flex-wrap items-center gap-2">
            {scored && <RiskBadge score={scored.score} showVerdict />}
            {fraud && fraud.level !== 'clear' && (
              <FraudBadge level={fraud.level} score={fraud.riskScore} />
            )}
            {customer.hasBankLoanHistory ? (
              <Badge tone="neutral">Has bureau record</Badge>
            ) : (
              <Badge tone="primary" icon={<Info />}>
                Thin file — no credit history
              </Badge>
            )}
          </span>
        }
      />

      <div className="flex flex-col gap-6">
        {/* ---------- the score, first and largest ---------- */}
        {scored && modelFeatures ? (
          <Section
            title="Can this person repay?"
            description="The CreditSense Score, and every factor that produced it."
          >
            <ScorePanel
              score={scored}
              features={modelFeatures}
              customerName={customer.fullName}
              scoredAt={storedScore?.scoredAt}
            />
          </Section>
        ) : (
          <Alert tone="warning" title="Not scored yet">
            This applicant has no engineered features, so no score could be produced. Run{' '}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
              npm run db:features
            </code>{' '}
            then{' '}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
              npm run db:score
            </code>
            .
          </Alert>
        )}

        {/* ---------- can we trust this application ----------
            Placed before affordability on purpose: if the application cannot
            be trusted, how much to lend is the wrong next question. */}
        {fraud && fraud.level !== 'clear' && (
          <Section
            title="Can we trust this application?"
            description="Fraud signals found in the behaviour, device and identity checks."
          >
            <FraudPanel assessment={fraud} customerName={customer.fullName}>
              <Link
                href={`/fraud/${id}`}
                className={buttonVariants({ variant: 'secondary', fullWidth: true })}
              >
                Open the full fraud investigation and relationship graph
              </Link>
            </FraudPanel>
          </Section>
        )}

        {/* ---------- how much can they safely borrow ---------- */}
        {affordability && (
          <Section
            title="How much can they safely borrow?"
            description="A specific, defensible amount — not just a risk rating."
          >
            <AffordabilityPanel
              assessment={affordability}
              customerName={customer.fullName}
            />
          </Section>
        )}

        {/* ---------- the one-sentence read ---------- */}
        {features ? (
          <Alert tone="info" icon={<Info />} title="What the signals say">
            {summariseProfile(features, customer.fullName.split(' ')[0])}
          </Alert>
        ) : (
          <Alert tone="warning" title="No feature snapshot yet">
            The engineered features have not been built for this customer. Run{' '}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
              npm run db:features
            </code>
            . The raw transaction history below is still complete.
          </Alert>
        )}

        {/* ---------- identity ---------- */}
        <Section title="Identity">
          <Card>
            <CardContent className="grid grid-cols-1 gap-x-6 gap-y-4 p-4 pt-4 sm:grid-cols-2 sm:p-5 sm:pt-5 lg:grid-cols-4">
              <Detail icon={CreditCard} label="CNIC" value={maskCNIC(customer.cnic)} />
              <Detail icon={Phone} label="Phone" value={formatPhone(customer.phone)} />
              <Detail icon={MapPin} label="Location" value={`${customer.city}, ${customer.province}`} />
              <Detail
                icon={Wallet}
                label="Wallet"
                value={`${titleFromSlug(customer.primaryWallet)} · opened ${formatDate(customer.walletOpenedAt)}`}
              />
              <Detail
                icon={CalendarDays}
                label="Date of birth"
                value={formatDate(customer.dateOfBirth)}
              />
              <Detail
                label="Employment"
                value={titleFromSlug(customer.employmentType)}
              />
              <Detail
                label="Household"
                value={
                  customer.householdSize
                    ? `${customer.householdSize} people, ${customer.dependents ?? 0} dependents`
                    : '—'
                }
              />
              <Detail
                label="Declared income"
                value={
                  customer.declaredMonthlyIncome
                    ? `${formatPKR(customer.declaredMonthlyIncome)}/mo`
                    : '—'
                }
                note={
                  features && customer.declaredMonthlyIncome
                    ? declaredVsObserved(customer.declaredMonthlyIncome, features.avgMonthlyInflow)
                    : undefined
                }
              />
            </CardContent>
          </Card>
        </Section>

        {/* ---------- the engineered signals ---------- */}
        {features && (
          <Section
            title="Engineered signals"
            description={`Derived from ${features.transactionCount.toLocaleString()} transactions over ${features.observationDays} days, ${formatDate(features.windowStart)} to ${formatDate(features.windowEnd)}.`}
          >
            <Card>
              <CardContent className="p-4 pt-4 sm:p-6 sm:pt-6">
                <SignalGrid>
                  {readings.map((reading) => (
                    <SignalStat
                      key={reading.key}
                      label={reading.label}
                      value={reading.value}
                      interpretation={reading.interpretation}
                      quality={reading.quality}
                      explain={reading.explain}
                    />
                  ))}
                </SignalGrid>
              </CardContent>
            </Card>
          </Section>
        )}

        {/* ---------- cash flow ---------- */}
        <Section
          title="Money in, month by month"
          description="Income excludes transfers, refunds and loan disbursements — money arriving is not the same as money earned."
        >
          <Card>
            <CardContent className="p-4 pt-4 sm:p-5 sm:pt-5">
              <CashflowChart buckets={buckets} />
              {features && (
                <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-4">
                  <SummaryFigure label="Average month" value={formatPKR(features.avgMonthlyInflow)} />
                  <SummaryFigure label="Median month" value={formatPKR(features.medianMonthlyInflow)} />
                  <SummaryFigure
                    label="Largest single payment"
                    value={formatPKR(features.largestSingleInflow)}
                  />
                  <SummaryFigure
                    label="Typical balance"
                    value={formatPKR(features.avgEndOfMonthBalance)}
                  />
                </dl>
              )}
            </CardContent>
          </Card>
        </Section>

        {/* ---------- bills ---------- */}
        <Section
          title="Utility bill record"
          description="The closest thing a thin-file applicant has to a repayment history: a recurring obligation, met with their own money, month after month."
        >
          <Card>
            <CardContent className="p-4 pt-4 sm:p-5 sm:pt-5">
              <BillTimeline bills={bills} />
            </CardContent>
          </Card>
        </Section>

        {/* ---------- top-ups and transactions ---------- */}
        <div className="grid gap-6 lg:grid-cols-3">
          <Section title="Mobile top-ups" className="lg:col-span-1">
            <Card>
              {topups.length === 0 ? (
                <EmptyState
                  icon={<Smartphone />}
                  title="No top-ups on record"
                  description="This applicant may be on a postpaid plan."
                />
              ) : (
                <ul className="divide-y divide-border">
                  {topups.map((topup) => (
                    <li key={topup.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {titleFromSlug(topup.productType)}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {titleFromSlug(topup.network)} · {formatDate(topup.occurredAt)}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-medium tabular-nums">{formatPKR(topup.amount)}</p>
                        {topup.isRecurring && (
                          <Badge tone="success" size="sm" className="mt-0.5">
                            Recurring
                          </Badge>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </Section>

          <Section title="Recent wallet activity" className="lg:col-span-2">
            <Card>
              <CardHeaderRow
                title="Last 40 transactions"
                description="Newest first"
                actions={
                  features ? (
                    <Badge tone="neutral">
                      {features.transactionCount.toLocaleString()} total
                    </Badge>
                  ) : null
                }
              />
              {transactions.length === 0 ? (
                <EmptyState
                  title="No wallet transactions"
                  description="Nothing has been recorded against this wallet."
                />
              ) : (
                <ul className="divide-y divide-border border-t border-border">
                  {transactions.map((tx) => (
                    <li key={tx.id} className="flex items-center gap-3 px-4 py-3">
                      <span
                        className={cn(
                          'flex size-8 shrink-0 items-center justify-center rounded-full',
                          tx.direction === 'in'
                            ? 'bg-risk-low-soft text-risk-low-on-soft'
                            : 'bg-muted text-muted-foreground',
                        )}
                        aria-hidden="true"
                      >
                        {tx.direction === 'in' ? (
                          <ArrowDownLeft className="size-4" />
                        ) : (
                          <ArrowUpRight className="size-4" />
                        )}
                      </span>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {tx.counterpartyName ?? titleFromSlug(tx.category)}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {titleFromSlug(tx.category)} · {formatDateTime(tx.occurredAt)}
                        </p>
                      </div>

                      <div className="shrink-0 text-right">
                        <p
                          className={cn(
                            'text-sm font-semibold tabular-nums',
                            tx.direction === 'in' ? 'text-risk-low' : 'text-foreground',
                          )}
                        >
                          {tx.direction === 'in' ? '+' : '−'}
                          {formatPKR(tx.amount).replace('Rs ', '')}
                        </p>
                        {tx.balanceAfter !== null && (
                          <p className="text-xs tabular-nums text-muted-foreground">
                            bal {formatPKR(tx.balanceAfter)}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </Section>
        </div>

        <Alert tone="info" title="What comes next">
          Phase 5 checks the identity and relationship signals for fraud. Phase 6 keeps
          re-scoring after disbursement and raises an alert when the behaviour deteriorates.
        </Alert>
      </div>
    </>
  )
}

function Detail({
  icon: Icon,
  label,
  value,
  note,
}: {
  icon?: React.ComponentType<{ className?: string }>
  label: string
  value: string
  note?: string
}) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {Icon && <Icon className="size-3.5 shrink-0" aria-hidden="true" />}
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm font-medium">{value}</dd>
      {note && <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>}
    </div>
  )
}

function SummaryFigure({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-base font-semibold tabular-nums sm:text-lg">{value}</dd>
    </div>
  )
}

/**
 * Applicants round their income up. The gap between what they declare and what
 * the wallet actually shows is a signal in itself — and a loan officer should
 * see it stated plainly rather than have to work it out.
 */
function declaredVsObserved(declared: number, observed: number): string {
  if (observed <= 0) return 'No observed income to compare against.'
  const ratio = declared / observed
  if (ratio > 1.4) return `Overstated — we observe ${formatPercent(1 / ratio)} of this.`
  if (ratio < 0.75) return `Understated — we observe ${formatPKR(observed)} a month.`
  return 'Broadly matches what we observe.'
}
