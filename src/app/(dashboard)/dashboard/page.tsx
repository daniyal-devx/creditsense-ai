import type { Metadata } from 'next'
import Link from 'next/link'
import {
  Activity,
  AlertOctagon,
  ArrowRight,
  FileText,
  PieChart,
  ShieldAlert,
  TrendingDown,
  Users,
  Wallet,
} from 'lucide-react'
import { PageHeader, Section } from '@/components/layout/page-header'
import { RiskBadge } from '@/components/risk/risk-badge'
import { Alert } from '@/components/ui/alert'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeaderRow } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { requireUser } from '@/lib/auth/guard'
import { ROLE_DEFINITIONS, can } from '@/lib/auth/roles'
import { getApplicationQueue, getQueueStats } from '@/lib/db/applications'
import { getFraudQueue, getFraudStats } from '@/lib/db/fraud'
import { getEarlyWarningFeed, getPortfolioHealth } from '@/lib/db/monitoring'
import { getScoreDistribution } from '@/lib/db/scores'
import { formatNumber, formatPKR, formatRelative } from '@/lib/utils/format'

export const metadata: Metadata = { title: 'Dashboard' }
export const dynamic = 'force-dynamic'

/**
 * The role-aware home.
 *
 * Every role gets the same page component but a genuinely different first
 * screen, because they open it to answer different questions. A Loan Officer
 * wants their queue; a Risk Analyst wants the shape of the book; a Fraud
 * Analyst wants what needs investigating. Showing all three to everyone would
 * make each of them slower to find their own.
 */
export default async function DashboardPage() {
  const user = await requireUser()
  const role = ROLE_DEFINITIONS[user.role]
  const firstName = user.fullName.split(' ')[0]

  return (
    <>
      <PageHeader
        title={`Good to see you, ${firstName}`}
        description={role.description}
        badge={<Badge tone="primary">{role.label}</Badge>}
      />

      <div className="flex flex-col gap-8">
        {can(user.role, 'applications:decide') && <LoanOfficerHome />}
        {can(user.role, 'fraud:investigate') && <FraudAnalystHome />}
        {can(user.role, 'portfolio:read') && <RiskAnalystHome />}
        {can(user.role, 'users:manage') && <AdminHome />}
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Loan Officer
// ---------------------------------------------------------------------------

async function LoanOfficerHome() {
  const [queue, stats] = await Promise.all([
    getApplicationQueue({ status: 'open', limit: 6 }),
    getQueueStats(),
  ])

  return (
    <Section
      title="Your decision queue"
      description="Applications waiting on you, with anything FraudSense has held at the top."
      actions={
        <Link href="/applications" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
          Open the queue
          <ArrowRight className="ml-2 size-4" aria-hidden="true" />
        </Link>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile icon={FileText} label="Awaiting decision" value={formatNumber(stats.pending + stats.inReview)} />
          <StatTile icon={Wallet} label="Total requested" value={formatPKR(stats.totalRequested)} />
          <StatTile
            icon={AlertOctagon}
            label="Held for fraud"
            value={formatNumber(stats.blockedByFraud)}
            tone={stats.blockedByFraud > 0 ? 'text-danger' : undefined}
          />
          <StatTile
            icon={Activity}
            label="Decided today"
            value={formatNumber(stats.approvedToday + stats.rejectedToday)}
          />
        </div>

        {queue.length === 0 ? (
          <Card>
            <EmptyState
              title="Nothing waiting"
              description="Every application has been decided. New ones will appear here."
            />
          </Card>
        ) : (
          <Card>
            <ul className="divide-y divide-border">
              {queue.map((app) => (
                <li key={app.id}>
                  <Link
                    href={`/applications/${app.id}`}
                    className="flex items-center gap-3 p-4 transition-colors hover:bg-accent sm:p-5"
                  >
                    <Avatar name={app.fullName} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{app.fullName}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {formatPKR(app.requestedAmount)} over {app.requestedTenorMonths} months ·{' '}
                        {formatRelative(app.submittedAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {app.fraudLevel === 'block' && (
                        <Badge tone="danger" size="sm" icon={<AlertOctagon />}>
                          Hold
                        </Badge>
                      )}
                      {app.band && <RiskBadge band={app.band} size="sm" />}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </Section>
  )
}

// ---------------------------------------------------------------------------
// Fraud Analyst
// ---------------------------------------------------------------------------

async function FraudAnalystHome() {
  const [queue, stats] = await Promise.all([getFraudQueue(6), getFraudStats()])

  return (
    <Section
      title="Fraud investigation"
      description="Applicants whose behaviour, device or identity signals need a human."
      actions={
        <Link href="/fraud" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
          Open FraudSense
          <ArrowRight className="ml-2 size-4" aria-hidden="true" />
        </Link>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile
            icon={AlertOctagon}
            label="Held for review"
            value={formatNumber(stats.block)}
            tone={stats.block > 0 ? 'text-danger' : undefined}
          />
          <StatTile icon={ShieldAlert} label="Needs investigating" value={formatNumber(stats.investigate)} />
          <StatTile icon={Users} label="Clusters" value={formatNumber(stats.clusters)} />
          <StatTile icon={Activity} label="Linked applicants" value={formatNumber(stats.linkedApplicants)} />
        </div>

        {queue.length === 0 ? (
          <Card>
            <EmptyState title="Nothing flagged" description="No applicant needs investigating." />
          </Card>
        ) : (
          <Card>
            <ul className="divide-y divide-border">
              {queue.map((row) => (
                <li key={row.customerId}>
                  <Link
                    href={`/fraud/${row.customerId}`}
                    className="flex items-center gap-3 p-4 transition-colors hover:bg-accent sm:p-5"
                  >
                    <Avatar name={row.fullName} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{row.fullName}</p>
                      <p className="truncate text-xs text-muted-foreground">{row.fraudSummary}</p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">
                      {row.fraudScore}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </Section>
  )
}

// ---------------------------------------------------------------------------
// Risk Analyst
// ---------------------------------------------------------------------------

async function RiskAnalystHome() {
  const [health, distribution, alerts] = await Promise.all([
    getPortfolioHealth(),
    getScoreDistribution(),
    getEarlyWarningFeed(5),
  ])

  const total = distribution.reduce((sum, d) => sum + d.customers, 0)

  return (
    <Section
      title="Portfolio health"
      description="How risk is distributed and who is deteriorating."
      actions={
        <Link href="/portfolio" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
          Open the portfolio
          <ArrowRight className="ml-2 size-4" aria-hidden="true" />
        </Link>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile icon={PieChart} label="Average score" value={formatNumber(Math.round(health.averageScore))} />
          <StatTile icon={Wallet} label="Outstanding" value={formatPKR(health.totalOutstanding)} />
          <StatTile
            icon={TrendingDown}
            label="Downgraded (30d)"
            value={formatNumber(health.recentDowngrades)}
            tone={health.recentDowngrades > 0 ? 'text-warning' : undefined}
          />
          <StatTile
            icon={AlertOctagon}
            label="Critical alerts"
            value={formatNumber(health.criticalAlerts)}
            tone={health.criticalAlerts > 0 ? 'text-danger' : undefined}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeaderRow title="Risk distribution" description={`${formatNumber(total)} scored customers`} />
            <CardContent>
              <ul className="flex flex-col gap-2.5">
                {distribution.map((row) => (
                  <li key={row.band.id} className="flex items-center gap-3">
                    <span className="w-28 shrink-0">
                      <RiskBadge band={row.band} size="sm" />
                    </span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <span
                        className="block h-full rounded-full"
                        style={{
                          width: `${total > 0 ? (row.customers / total) * 100 : 0}%`,
                          backgroundColor: row.band.cssVar,
                        }}
                      />
                    </span>
                    <span className="w-10 shrink-0 text-right text-sm tabular-nums">
                      {row.customers}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeaderRow
              title="Latest warnings"
              description="Most urgent open alerts."
              actions={
                <Link href="/monitoring" className="text-sm font-medium text-primary hover:underline">
                  All
                </Link>
              }
            />
            {alerts.length === 0 ? (
              <CardContent>
                <p className="py-4 text-sm text-muted-foreground">No open alerts.</p>
              </CardContent>
            ) : (
              <ul className="divide-y divide-border border-t border-border">
                {alerts.map((alert) => (
                  <li key={alert.alertId}>
                    <Link
                      href={`/customers/${alert.customerId}`}
                      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{alert.title}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {alert.fullName}
                        </span>
                      </span>
                      <Badge
                        tone={alert.severity === 'critical' ? 'danger' : 'warning'}
                        size="sm"
                      >
                        {alert.severity}
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </Section>
  )
}

// ---------------------------------------------------------------------------
// Administrator
// ---------------------------------------------------------------------------

async function AdminHome() {
  return (
    <Section title="Administration">
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeaderRow
            title="Users & roles"
            description="Invite users, assign roles, revoke access."
          />
          <CardContent>
            <Link
              href="/admin/users"
              className={buttonVariants({ variant: 'secondary', fullWidth: true })}
            >
              Manage users
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeaderRow
            title="Audit trail"
            description="Every decision, who made it, and the reasoning they recorded."
          />
          <CardContent>
            <Link
              href="/audit"
              className={buttonVariants({ variant: 'secondary', fullWidth: true })}
            >
              Open the audit trail
            </Link>
          </CardContent>
        </Card>
      </div>

      <Alert tone="info" className="mt-4" title="You see every section">
        The Administrator role holds every permission, so this page shows the Loan Officer, Fraud
        Analyst and Risk Analyst views together. Each of those roles sees only their own.
      </Alert>
    </Section>
  )
}

// ---------------------------------------------------------------------------

function StatTile({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  tone?: string
}) {
  return (
    <Card>
      <CardContent className="p-4 pt-4 sm:p-5 sm:pt-5">
        <div className="flex items-center gap-2">
          <Icon className={`size-4 shrink-0 ${tone ?? 'text-muted-foreground'}`} />
          <p className="truncate text-sm text-muted-foreground">{label}</p>
        </div>
        <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  )
}
