'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  BellOff,
  Check,
  Eye,
  Radio,
  TrendingDown,
  WalletMinimal,
} from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { Alert } from '@/components/ui/alert'
import { Avatar } from '@/components/ui/avatar'
import { Badge, type BadgeTone } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { useToast } from '@/components/ui/toast'
import { subscribeToAlerts, type RealtimeStatus } from '@/lib/supabase/realtime'
import { ALERT_TYPE_LABELS, type AlertSeverity, type AlertType } from '@/lib/monitoring/early-warning'
import type { AlertRow } from '@/lib/db/monitoring'
import { formatPKR, formatRelative } from '@/lib/utils/format'

/**
 * The early-warning feed.
 *
 * Live over Supabase Realtime: when the monitoring run raises a new alert, an
 * open portfolio view updates without a refresh. The socket only ever delivers
 * a "something changed" notification — the page then re-fetches through the
 * server, which checks the viewer's role first. No applicant data crosses the
 * websocket.
 *
 * Every alert carries a recommended action. An alert that tells you something
 * is wrong but not what to do about it is one that gets scrolled past, and a
 * feed people scroll past is worse than no feed at all.
 */

const SEVERITY_CONFIG: Record<
  AlertSeverity,
  { tone: BadgeTone; icon: typeof AlertOctagon; ring: string; label: string }
> = {
  critical: {
    tone: 'danger',
    icon: AlertOctagon,
    ring: 'border-danger/40 bg-danger-soft/30',
    label: 'Critical',
  },
  high: {
    tone: 'danger',
    icon: AlertTriangle,
    ring: 'border-risk-high/40 bg-risk-high-soft/30',
    label: 'High',
  },
  medium: {
    tone: 'warning',
    icon: Eye,
    ring: 'border-warning/30 bg-warning-soft/20',
    label: 'Medium',
  },
  low: { tone: 'neutral', icon: Eye, ring: 'border-border bg-surface', label: 'Low' },
}

const TYPE_ICONS: Record<AlertType, typeof Activity> = {
  income_collapse: TrendingDown,
  missed_bill_streak: AlertTriangle,
  wallet_dormancy: WalletMinimal,
  score_deterioration: TrendingDown,
  affordability_breach: Activity,
  repayment_missed: AlertOctagon,
  balance_depletion: WalletMinimal,
}

export function AlertFeed({
  alerts,
  canAcknowledge,
}: {
  alerts: AlertRow[]
  canAcknowledge: boolean
}) {
  const router = useRouter()
  const toast = useToast()
  const [status, setStatus] = React.useState<RealtimeStatus>('connecting')
  const [acknowledging, setAcknowledging] = React.useState<string | null>(null)
  const [filter, setFilter] = React.useState<AlertSeverity | 'all'>('all')

  React.useEffect(() => {
    const subscription = subscribeToAlerts({
      onChange: () => {
        // Re-fetch through the server rather than trusting the payload — the
        // socket says *that* something changed, never *what*.
        router.refresh()
      },
      onStatus: setStatus,
    })
    return () => subscription.unsubscribe()
  }, [router])

  const acknowledge = async (alertId: string, customerName: string) => {
    setAcknowledging(alertId)
    try {
      const response = await fetch(`/api/monitoring/alerts/${alertId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'acknowledge' }),
      })
      if (!response.ok) {
        const data = await response.json()
        toast.error('Could not acknowledge', data.error)
        return
      }
      toast.success('Alert acknowledged', `${customerName} taken off the open feed.`)
      router.refresh()
    } catch {
      toast.error('Could not reach the server')
    } finally {
      setAcknowledging(null)
    }
  }

  const visible = filter === 'all' ? alerts : alerts.filter((a) => a.severity === filter)

  const counts = React.useMemo(() => {
    const map: Record<string, number> = { all: alerts.length }
    for (const alert of alerts) map[alert.severity] = (map[alert.severity] ?? 0) + 1
    return map
  }, [alerts])

  return (
    <div className="flex flex-col gap-4">
      {/* ---------- live status + filters ---------- */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">
          {(['all', 'critical', 'high', 'medium', 'low'] as const).map((level) => {
            const count = counts[level] ?? 0
            if (level !== 'all' && count === 0) return null
            return (
              <button
                key={level}
                type="button"
                onClick={() => setFilter(level)}
                className={cn(
                  'flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors sm:min-h-9',
                  filter === level
                    ? 'border-primary bg-primary-soft text-primary-soft-foreground'
                    : 'border-border text-muted-foreground hover:bg-accent',
                )}
              >
                {level === 'all' ? 'All' : SEVERITY_CONFIG[level].label}
                <span className="tabular-nums opacity-70">{count}</span>
              </button>
            )
          })}
        </div>

        <RealtimeIndicator status={status} />
      </div>

      {status === 'unavailable' && (
        <Alert tone="info">
          Live updates are off — no Supabase keys are configured for the browser. The feed still
          works; it just will not refresh by itself.
        </Alert>
      )}

      {/* ---------- the feed ---------- */}
      {visible.length === 0 ? (
        <Card>
          <EmptyState
            icon={<BellOff />}
            title={filter === 'all' ? 'No open alerts' : `No ${filter} alerts`}
            description={
              filter === 'all'
                ? 'Nobody in the portfolio is showing early-warning signals right now.'
                : 'Try a different severity.'
            }
          />
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((alert) => {
            const config = SEVERITY_CONFIG[alert.severity]
            const TypeIcon = TYPE_ICONS[alert.alertType] ?? Activity

            return (
              <li key={alert.alertId}>
                <Card className={cn('border p-4 sm:p-5', config.ring)}>
                  <div className="flex items-start gap-3">
                    <span
                      className={cn(
                        'flex size-9 shrink-0 items-center justify-center rounded-lg',
                        alert.severity === 'critical' || alert.severity === 'high'
                          ? 'bg-danger-soft text-danger-soft-foreground'
                          : 'bg-warning-soft text-warning-soft-foreground',
                      )}
                      aria-hidden="true"
                    >
                      <TypeIcon className="size-[18px]" />
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="font-semibold leading-snug">{alert.title}</p>
                        <Badge tone={config.tone} size="sm">
                          {config.label}
                        </Badge>
                        <Badge tone="neutral" size="sm">
                          {ALERT_TYPE_LABELS[alert.alertType]}
                        </Badge>
                      </div>

                      <Link
                        href={`/customers/${alert.customerId}`}
                        className="mt-2 inline-flex items-center gap-2 rounded-lg transition-colors hover:text-primary"
                      >
                        <Avatar name={alert.fullName} size="xs" />
                        <span className="text-sm font-medium">{alert.fullName}</span>
                        <span className="text-xs text-muted-foreground">· {alert.city}</span>
                      </Link>

                      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                        {alert.detail}
                      </p>

                      <p className="mt-2 flex gap-2 rounded-lg bg-surface-sunken p-2.5 text-sm leading-relaxed">
                        <span className="shrink-0 font-medium">Do this:</span>
                        <span className="text-muted-foreground">{alert.recommendedAction}</span>
                      </p>

                      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                        <span>{formatRelative(alert.raisedAt)}</span>
                        {alert.currentScore !== null && (
                          <span>
                            Score{' '}
                            <span className="font-medium text-foreground">
                              {alert.currentScore}
                            </span>
                            {alert.scoreChange !== null && alert.scoreChange < 0 && (
                              <span className="ml-1 text-danger">({alert.scoreChange})</span>
                            )}
                          </span>
                        )}
                        {alert.outstandingBalance !== null && alert.outstandingBalance > 0 && (
                          <span>
                            Outstanding{' '}
                            <span className="font-medium text-foreground">
                              {formatPKR(alert.outstandingBalance)}
                            </span>
                          </span>
                        )}
                        {alert.loanReference && <span className="font-mono">{alert.loanReference}</span>}
                      </div>
                    </div>
                  </div>

                  {canAcknowledge && (
                    <div className="mt-4 flex flex-col gap-2 border-t border-border pt-3 sm:flex-row sm:justify-end">
                      <Button
                        variant="secondary"
                        loading={acknowledging === alert.alertId}
                        onClick={() => acknowledge(alert.alertId, alert.fullName)}
                        leadingIcon={<Check className="size-4" />}
                      >
                        Acknowledge
                      </Button>
                    </div>
                  )}
                </Card>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function RealtimeIndicator({ status }: { status: RealtimeStatus }) {
  const config = {
    live: { label: 'Live', tone: 'text-success', pulse: true },
    connecting: { label: 'Connecting…', tone: 'text-muted-foreground', pulse: false },
    unavailable: { label: 'Not live', tone: 'text-muted-foreground', pulse: false },
    error: { label: 'Reconnecting…', tone: 'text-warning', pulse: false },
  }[status]

  return (
    <span
      className={cn('flex shrink-0 items-center gap-1.5 text-xs font-medium', config.tone)}
      aria-live="polite"
    >
      <Radio className={cn('size-3.5', config.pulse && 'animate-pulse')} aria-hidden="true" />
      {config.label}
    </span>
  )
}
