import type { Metadata } from 'next'
import { AlertOctagon, Clock, FileCheck, FileText, Wallet } from 'lucide-react'
import { PageHeader, Section } from '@/components/layout/page-header'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { requirePermission } from '@/lib/auth/guard'
import { can } from '@/lib/auth/roles'
import { getApplicationQueue, getQueueStats } from '@/lib/db/applications'
import { formatNumber, formatPKR } from '@/lib/utils/format'
import { QueueTable } from './queue-table'

export const metadata: Metadata = { title: 'Applications' }
export const dynamic = 'force-dynamic'

/**
 * The application queue.
 *
 * Ordered so that anything FraudSense has flagged for mandatory review sits at
 * the top — approving one of those by mistake is the most expensive error
 * available on this screen.
 */
export default async function ApplicationsPage() {
  const user = await requirePermission('applications:read')

  const [queue, stats] = await Promise.all([getApplicationQueue({ status: 'open' }), getQueueStats()])

  const tiles = [
    {
      icon: FileText,
      label: 'Awaiting decision',
      value: formatNumber(stats.pending + stats.inReview),
      detail: `${formatNumber(stats.inReview)} in manual review`,
      tone: 'text-muted-foreground',
    },
    {
      icon: Wallet,
      label: 'Total requested',
      value: formatPKR(stats.totalRequested),
      detail: 'across the open queue',
      tone: 'text-muted-foreground',
    },
    {
      icon: Clock,
      label: 'Longest wait',
      value: stats.oldestPendingDays === 0 ? 'Today' : `${stats.oldestPendingDays} days`,
      detail: 'oldest pending application',
      tone: stats.oldestPendingDays >= 3 ? 'text-warning' : 'text-muted-foreground',
    },
    {
      icon: FileCheck,
      label: 'Decided today',
      value: formatNumber(stats.approvedToday + stats.rejectedToday),
      detail: `${formatNumber(stats.approvedToday)} approved, ${formatNumber(stats.rejectedToday)} rejected`,
      tone: 'text-muted-foreground',
    },
  ]

  return (
    <>
      <PageHeader
        title="Application queue"
        description={
          can(user.role, 'applications:decide')
            ? 'Every application waiting on a decision, with its score, affordability and fraud flags.'
            : 'Every application waiting on a decision. Your role can read these but not decide them.'
        }
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Applications' }]}
        badge={
          stats.blockedByFraud > 0 ? (
            <Badge tone="danger" icon={<AlertOctagon />}>
              {stats.blockedByFraud} held by FraudSense
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

        {stats.blockedByFraud > 0 && (
          <Alert
            tone="danger"
            icon={<AlertOctagon />}
            title={`${stats.blockedByFraud} ${stats.blockedByFraud === 1 ? 'application is' : 'applications are'} held for fraud review`}
          >
            These sit at the top of the queue and cannot be approved until a Fraud Analyst clears
            them. They can still be rejected.
          </Alert>
        )}

        {!can(user.role, 'applications:decide') && (
          <Alert tone="info" title="Read-only for your role">
            You can open any application and see the full assessment, but approve and reject are
            limited to the Loan Officer and Administrator roles.
          </Alert>
        )}

        <Section title="Open applications">
          <QueueTable applications={queue} />
        </Section>
      </div>
    </>
  )
}
