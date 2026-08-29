import type { Metadata } from 'next'
import { PhasePlaceholder } from '@/components/layout/phase-placeholder'

export const metadata: Metadata = { title: 'Audit Trail' }

export default function AuditPage() {
  return (
    <PhasePlaceholder
      title="Audit trail"
      description="Every decision, who made it, when, and the reasoning they recorded."
      phaseNumber={2}
      breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Audit Trail' }]}
      whatArrives={[
        'An append-only record of every approve, reject and manual-review decision',
        'The user, the role, the timestamp and the reasoning captured at the time',
        'Filterable by applicant, by decision-maker and by date range',
      ]}
    />
  )
}
