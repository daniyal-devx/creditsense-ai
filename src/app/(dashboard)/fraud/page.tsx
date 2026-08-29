import type { Metadata } from 'next'
import Link from 'next/link'
import { AlertOctagon, AlertTriangle, Eye, Network, ShieldCheck, Users } from 'lucide-react'
import { PageHeader, Section } from '@/components/layout/page-header'
import { FraudBadge } from '@/components/fraud/fraud-panel'
import { Alert } from '@/components/ui/alert'
import { Avatar } from '@/components/ui/avatar'
import { Badge, type BadgeTone } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeaderRow } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { requirePermission } from '@/lib/auth/guard'
import { getClusters, getFraudQueue, getFraudStats } from '@/lib/db/fraud'
import { formatNumber, formatRelative, titleFromSlug } from '@/lib/utils/format'

export const metadata: Metadata = { title: 'FraudSense' }
export const dynamic = 'force-dynamic'

const SEVERITY_TONE: Record<string, BadgeTone> = {
  critical: 'danger',
  high: 'danger',
  medium: 'warning',
  low: 'neutral',
}

/**
 * The Fraud Analyst's queue.
 *
 * Two lists, because they answer different questions. The queue answers "who
 * needs looking at?" and the clusters answer "is anything organised happening?"
 * — and a ring is only ever visible in the second.
 */
export default async function FraudPage() {
  await requirePermission('fraud:read')

  const [queue, clusters, stats] = await Promise.all([
    getFraudQueue(200),
    getClusters(),
    getFraudStats(),
  ])

  const tiles = [
    { icon: AlertOctagon, label: 'Do not decide', value: stats.block, tone: 'text-danger' },
    { icon: AlertTriangle, label: 'Needs investigation', value: stats.investigate, tone: 'text-warning' },
    { icon: Eye, label: 'Minor signals', value: stats.review, tone: 'text-info' },
    { icon: Network, label: 'Clusters detected', value: stats.clusters, tone: 'text-muted-foreground' },
  ]

  return (
    <>
      <PageHeader
        title="FraudSense"
        description="Can we trust this application? Anomaly detection over transaction behaviour, plus the relationship graph that makes coordinated rings visible."
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'FraudSense' }]}
        badge={
          stats.block > 0 ? (
            <Badge tone="danger" icon={<AlertOctagon />}>
              {stats.block} on hold
            </Badge>
          ) : undefined
        }
      />

      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {tiles.map((tile) => {
            const Icon = tile.icon
            return (
              <Card key={tile.label}>
                <CardContent className="p-4 pt-4 sm:p-5 sm:pt-5">
                  <div className="flex items-center gap-2">
                    <Icon className={`size-4 shrink-0 ${tile.tone}`} aria-hidden="true" />
                    <p className="truncate text-sm text-muted-foreground">{tile.label}</p>
                  </div>
                  <p className="mt-2 text-2xl font-semibold tabular-nums">
                    {formatNumber(tile.value)}
                  </p>
                </CardContent>
              </Card>
            )
          })}
        </div>

        {stats.assessed === 0 && (
          <Alert tone="info" title="FraudSense has not been run yet">
            Run{' '}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
              npm run db:fraud
            </code>{' '}
            to assess the portfolio and build the relationship graph.
          </Alert>
        )}

        {/* ---------- clusters ---------- */}
        <Section
          title="Detected clusters"
          description="Groups of applicants linked by device, address, counterparty or money movement. A ring is only visible here — never in a single application."
        >
          {clusters.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Network />}
                title="No clusters detected"
                description="No group of applicants is connected strongly enough to look coordinated."
              />
            </Card>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {clusters.map((cluster) => (
                <Card key={cluster.id}>
                  <CardHeaderRow
                    title={
                      <span className="flex items-center gap-2">
                        <Users className="size-4 text-muted-foreground" aria-hidden="true" />
                        {cluster.memberCount} connected applicants
                      </span>
                    }
                    description={`Cohesion ${cluster.cohesion.toFixed(2)} · linked by ${cluster.linkTypes.map((t) => titleFromSlug(t).toLowerCase()).join(', ')}`}
                    actions={
                      <Badge tone={SEVERITY_TONE[cluster.severity] ?? 'neutral'}>
                        {cluster.severity}
                      </Badge>
                    }
                  />
                  <CardContent>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {cluster.assessment}
                    </p>

                    <ul className="mt-4 flex flex-col gap-2">
                      {cluster.members.map((member) => (
                        <li key={member.id}>
                          <Link
                            href={`/fraud/${member.id}`}
                            className="flex min-h-11 items-center gap-3 rounded-lg border border-border px-3 transition-colors hover:bg-accent"
                          >
                            <Avatar name={member.fullName} size="sm" />
                            <span className="min-w-0 flex-1 truncate text-sm font-medium">
                              {member.fullName}
                            </span>
                            {member.fraudScore !== null && (
                              <span className="shrink-0 text-sm font-semibold tabular-nums">
                                {member.fraudScore}
                              </span>
                            )}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </Section>

        {/* ---------- the queue ---------- */}
        <Section
          title="Flagged applicants"
          description="Everything above 'clear', worst first."
        >
          {queue.length === 0 ? (
            <Card>
              <EmptyState
                icon={<ShieldCheck />}
                title="Nothing flagged"
                description="No applicant is showing fraud signals worth reviewing."
              />
            </Card>
          ) : (
            <ul className="flex flex-col gap-3">
              {queue.map((row) => (
                <li key={row.customerId}>
                  <Link href={`/fraud/${row.customerId}`} className="block">
                    <Card interactive className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <Avatar name={row.fullName} size="sm" />
                          <div className="min-w-0">
                            <p className="truncate font-medium">{row.fullName}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {titleFromSlug(row.persona)} · {row.city} ·{' '}
                              {formatRelative(row.assessedAt)}
                            </p>
                          </div>
                        </div>
                        <FraudBadge level={row.fraudLevel} score={row.fraudScore} size="sm" />
                      </div>

                      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                        {row.fraudSummary}
                      </p>

                      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
                        {row.flagCodes.map((code) => (
                          <Badge key={code} tone="neutral" size="sm">
                            {titleFromSlug(code)}
                          </Badge>
                        ))}
                        {row.creditScore !== null && (
                          <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                            Credit score {row.creditScore}
                          </span>
                        )}
                      </div>
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <div className="flex justify-center">
          <Link href="/customers" className={buttonVariants({ variant: 'secondary' })}>
            Browse all customers
          </Link>
        </div>
      </div>
    </>
  )
}
