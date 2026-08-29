import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowDown, ArrowUp, PieChart, TrendingDown, Users, Wallet } from 'lucide-react'
import { PageHeader, Section } from '@/components/layout/page-header'
import {
  BandMigrationChart,
  ExposureChart,
  RiskDistributionChart,
  ScoreTrendChart,
} from '@/components/portfolio/portfolio-charts'
import { RiskBadge } from '@/components/risk/risk-badge'
import { Alert } from '@/components/ui/alert'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeaderRow } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { requirePermission } from '@/lib/auth/guard'
import {
  getPersonaBreakdown,
  getPortfolioHealth,
  getPortfolioTrend,
  getRiskMigrations,
} from '@/lib/db/monitoring'
import { getScoreDistribution } from '@/lib/db/scores'
import {
  formatNumber,
  formatPKR,
  formatPKRCompact,
  formatPercent,
  formatRelative,
  titleFromSlug,
} from '@/lib/utils/format'

export const metadata: Metadata = { title: 'Portfolio Risk' }
export const dynamic = 'force-dynamic'

/**
 * The Risk Analyst's view.
 *
 * Answers three questions in order: what does the book look like now, how is
 * it moving, and who specifically is getting worse. The last one is the reason
 * anyone opens this page in a hurry, so the migration list is named plainly
 * rather than buried under a chart.
 */
export default async function PortfolioPage() {
  await requirePermission('portfolio:read')

  const [distribution, health, trend, migrations, personas] = await Promise.all([
    getScoreDistribution(),
    getPortfolioHealth(),
    getPortfolioTrend(60),
    getRiskMigrations(30),
    getPersonaBreakdown(),
  ])

  const totalScored = distribution.reduce((sum, d) => sum + d.customers, 0)
  const higherRisk = distribution
    .filter((d) => d.band.id === 'high' || d.band.id === 'very-high')
    .reduce((sum, d) => sum + d.customers, 0)

  const tiles = [
    {
      icon: Users,
      label: 'Customers scored',
      value: formatNumber(health.scoredCustomers),
      detail: `of ${formatNumber(health.totalCustomers)} total`,
    },
    {
      icon: PieChart,
      label: 'Average score',
      value: formatNumber(Math.round(health.averageScore)),
      detail: `${formatPercent(totalScored > 0 ? higherRisk / totalScored : 0, { decimals: 0 })} in the top two risk bands`,
    },
    {
      icon: Wallet,
      label: 'Outstanding',
      // Compact, because "Rs 21,919,969" at 24px does not fit a 136px grid
      // cell at 320px — and lakh/crore is how a Pakistani lender says it anyway.
      value: formatPKRCompact(health.totalOutstanding),
      detail: `${formatNumber(health.activeLoans)} live loans`,
    },
    {
      icon: TrendingDown,
      label: 'Delinquent',
      value: formatNumber(health.delinquentLoans + health.defaultedLoans),
      detail: `${formatNumber(health.defaultedLoans)} in default`,
    },
  ]

  const downgrades = migrations.filter((m) => m.scoreChange < 0)
  const upgrades = migrations.filter((m) => m.scoreChange > 0)

  return (
    <>
      <PageHeader
        title="Portfolio risk"
        description="How risk is distributed across every customer, how it is moving, and who specifically is deteriorating."
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Portfolio Risk' }]}
      />

      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {tiles.map((tile) => {
            const Icon = tile.icon
            return (
              <Card key={tile.label}>
                <CardContent className="p-4 pt-4 sm:p-5 sm:pt-5">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Icon className="size-4 shrink-0" aria-hidden="true" />
                    <p className="truncate text-sm">{tile.label}</p>
                  </div>
                  <p className="mt-2 text-2xl font-semibold tabular-nums">{tile.value}</p>
                  <p className="mt-1 text-xs leading-snug text-muted-foreground">{tile.detail}</p>
                </CardContent>
              </Card>
            )
          })}
        </div>

        {totalScored === 0 && (
          <Alert tone="info" title="Nothing scored yet">
            Run{' '}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">npm run db:score</code>{' '}
            to score the portfolio.
          </Alert>
        )}

        {/* ---------- distribution ---------- */}
        <Section title="Where the book sits today">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeaderRow
                title="Risk distribution"
                description="Customers by CreditSense band."
              />
              <CardContent>
                <RiskDistributionChart distribution={distribution} />
              </CardContent>
            </Card>

            <Card>
              <CardHeaderRow title="By band" description="With the average score in each." />
              <CardContent>
                <ul className="flex flex-col gap-3">
                  {distribution.map((row) => (
                    <li key={row.band.id} className="flex items-center justify-between gap-3">
                      <RiskBadge band={row.band} size="sm" />
                      <span className="shrink-0 text-right">
                        <span className="block text-sm font-semibold tabular-nums">
                          {formatNumber(row.customers)}
                        </span>
                        {row.customers > 0 && (
                          <span className="block text-xs tabular-nums text-muted-foreground">
                            avg {row.avgScore}
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        </Section>

        {/* ---------- trends ---------- */}
        <Section title="How it is moving">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeaderRow
                title="Average score"
                description="Daily snapshots. A falling line means the book is deteriorating faster than it is being replaced."
              />
              <CardContent>
                <ScoreTrendChart snapshots={trend} />
              </CardContent>
            </Card>

            <Card>
              <CardHeaderRow
                title="Band composition"
                description="Where customers are drifting between bands."
              />
              <CardContent>
                <BandMigrationChart snapshots={trend} />
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeaderRow
                title="Exposure at risk"
                description="Total outstanding across live loans."
              />
              <CardContent>
                <ExposureChart snapshots={trend} />
              </CardContent>
            </Card>
          </div>
        </Section>

        {/* ---------- who is getting worse ---------- */}
        <Section
          title="Who is getting worse"
          description="Customers who crossed into a different risk band. Downgrades first — that is the reason anyone opens this page in a hurry."
        >
          {migrations.length === 0 ? (
            <Card>
              <EmptyState
                title="No band changes yet"
                description="Migrations appear once the monitoring run has been executed on more than one day."
              />
            </Card>
          ) : (
            <Card>
              <ul className="divide-y divide-border">
                {[...downgrades, ...upgrades].map((migration) => (
                  <li key={`${migration.customerId}-${migration.migratedAt.getTime()}`}>
                    <Link
                      href={`/customers/${migration.customerId}`}
                      className="flex items-center gap-3 p-4 transition-colors hover:bg-accent sm:p-5"
                    >
                      <Avatar name={migration.fullName} size="sm" />

                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{migration.fullName}</p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                          <span>{migration.fromBand.label}</span>
                          <span aria-hidden="true">→</span>
                          <span className={migration.toBand.textClass}>{migration.toBand.label}</span>
                          <span>· {formatRelative(migration.migratedAt)}</span>
                        </p>
                      </div>

                      <div className="shrink-0 text-right">
                        <p className="text-sm tabular-nums">
                          <span className="text-muted-foreground">{migration.fromScore}</span>
                          <span className="mx-1 text-muted-foreground" aria-hidden="true">
                            →
                          </span>
                          <span className="font-semibold">{migration.toScore}</span>
                        </p>
                        <p
                          className={
                            migration.scoreChange < 0
                              ? 'flex items-center justify-end gap-0.5 text-xs font-medium text-danger'
                              : 'flex items-center justify-end gap-0.5 text-xs font-medium text-success'
                          }
                        >
                          {migration.scoreChange < 0 ? (
                            <ArrowDown className="size-3" aria-hidden="true" />
                          ) : (
                            <ArrowUp className="size-3" aria-hidden="true" />
                          )}
                          {Math.abs(migration.scoreChange)}
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </Section>

        {/* ---------- fairness check ---------- */}
        {personas.length > 0 && (
          <Section
            title="Risk by occupation type"
            description="A fairness check, not a segmentation. The model never sees occupation — if one persona scores far below another on similar behaviour, that is worth investigating."
          >
            <Card>
              <ul className="divide-y divide-border">
                {personas.map((row) => (
                  <li
                    key={row.persona}
                    className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5"
                  >
                    <div className="min-w-0">
                      <p className="font-medium">{titleFromSlug(row.persona)}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatNumber(row.customers)} customers · average income{' '}
                        {formatPKR(row.averageIncome)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-4">
                      <div className="text-right">
                        <p className="text-lg font-semibold tabular-nums">{row.averageScore}</p>
                        <p className="text-xs text-muted-foreground">avg score</p>
                      </div>
                      <Badge tone="neutral" size="sm">
                        {formatPercent(row.defaultRate)} PD
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          </Section>
        )}
      </div>
    </>
  )
}
