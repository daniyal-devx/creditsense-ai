import type { Metadata } from 'next'
import { PhasePlaceholder } from '@/components/layout/phase-placeholder'

export const metadata: Metadata = { title: 'Monitoring' }

export default function MonitoringPage() {
  return (
    <PhasePlaceholder
      title="Continuous monitoring"
      description="What happens after the loan is given. Scoring is not a one-time event."
      phaseNumber={6}
      breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Monitoring' }]}
      whatArrives={[
        'Approved customers re-scored as new signals arrive',
        'Early-warning signals: income collapse, missed bills, wallet dormancy',
        'Alerts pushed live to the portfolio view over Supabase Realtime',
        'Risk migration trends across the portfolio',
      ]}
    />
  )
}
