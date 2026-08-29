import type { Metadata } from 'next'
import { Activity, AlertOctagon, BellRing, TrendingDown, Wallet } from 'lucide-react'
import { PageHeader, Section } from '@/components/layout/page-header'
import { AlertFeed } from '@/components/monitoring/alert-feed'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { requirePermission } from '@/lib/auth/guard'
import { can } from '@/lib/auth/roles'
import {
  getAlertBreakdown,
  getEarlyWarningFeed,
  getPortfolioHealth,
} from '@/lib/db/monitoring'
import { ALERT_TYPE_LABELS } from '@/lib/monitoring/early-warning'
import { formatNumber, formatPKRCompact } from '@/lib/utils/format'

export const metadata: Metadata = { title: 'Monitoring' }
export const dynamic = 'force-dynamic'

/**
 * Continuous monitoring — the early-warning feed.
 *
 * Phase 6's "done when": a customer whose behaviour deteriorates after
 * disbursement triggers an alert *before* they default. This is the screen
 * that alert lands on.
 */
export default async function MonitoringPage() {
  const user = await requirePermission('monitoring:read')

  const [alerts, health, breakdown] = await Promise.all([
    getEarlyWarningFeed(150),
    getPortfolioHealth(),
    getAlertBreakdown(),
  ])

  const tiles = [
    {
      icon: AlertOctagon,
      label: 'Critical alerts',
      value: formatNumber(health.criticalAlerts),
      tone: 'text-danger',
      detail: 'Need contacting now',
    },
    {
      icon: BellRing,
      label: 'Open alerts',
      value: formatNumber(health.openAlerts),
      tone: 'text-warning',
      detail: `across ${formatNumber(health.activeLoans)} live loans`,
    },
    {
      icon: TrendingDown,
      label: 'Downgraded',
      value: formatNumber(health.recentDowngrades),
      tone: 'text-risk-high',
      detail: 'moved to a worse band in 30 days',
    },
    {
      icon: Wallet,
      label: 'At risk',
      value: formatPKRCompact(health.totalOutstanding),
      tone: 'text-muted-foreground',
      detail: `${formatNumber(health.delinquentLoans)} delinquent`,
    },
  ]

  return (
    <>
      <PageHeader
        title="Continuous monitoring"
        description="What happens after the loan is given. Approved customers are re-scored as new signals arrive, and any deterioration raises an alert before a payment is missed."
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Monitoring' }]}
        badge={
          health.criticalAlerts > 0 ? (
            <Badge tone="danger" icon={<AlertOctagon />}>
              {health.criticalAlerts} critical
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
                  <p className="mt-2 text-2xl font-semibold tabular-nums">{tile.value}</p>
                  <p className="mt-1 text-xs leading-snug text-muted-foreground">{tile.detail}</p>
                </CardContent>
              </Card>
            )
          })}
        </div>

        {health.openAlerts === 0 && health.activeLoans === 0 && (
          <Alert tone="info" icon={<Activity />} title="Monitoring has not run yet">
            Run{' '}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
              npm run db:monitor
            </code>{' '}
            to re-score customers with live exposure and raise early-warning alerts.
          </Alert>
        )}

        {breakdown.length > 0 && (
          <Section title="What is being flagged">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {breakdown.map((row) => (
                <Card key={row.alertType}>
                  <CardContent className="p-3 pt-3 sm:p-4 sm:pt-4">
                    <p className="text-xl font-semibold tabular-nums">{row.count}</p>
                    <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                      {ALERT_TYPE_LABELS[row.alertType]}
                    </p>
                    {row.criticalCount > 0 && (
                      <p className="mt-1 text-xs font-medium text-danger">
                        {row.criticalCount} critical
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </Section>
        )}

        <Section
          title="Early-warning feed"
          description="Open alerts, most urgent first. Updates live as the monitoring run raises new ones."
        >
          <AlertFeed alerts={alerts} canAcknowledge={can(user.role, 'monitoring:read')} />
        </Section>

        <Alert tone="info" title="Why this exists">
          The failure this prevents is a lender approving someone on good signals, hearing nothing,
          and finding out there is a problem when a payment is missed — by which point the money is
          gone. Income stops before payments do, because people run down savings first. Every rule
          here fires on <strong>change</strong>, not on level: a customer who has always been
          marginal is not news, but one who was fine last month and is not now is exactly the point.
        </Alert>
      </div>
    </>
  )
}
