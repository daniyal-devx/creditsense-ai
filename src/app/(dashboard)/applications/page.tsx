import type { Metadata } from 'next'
import { PhasePlaceholder } from '@/components/layout/phase-placeholder'

export const metadata: Metadata = { title: 'Applications' }

export default function ApplicationsPage() {
  return (
    <PhasePlaceholder
      title="Application queue"
      description="Every application waiting on a decision, with its score, affordability figure and fraud flags."
      phaseNumber={7}
      breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Applications' }]}
      whatArrives={[
        'A sortable, filterable table on desktop and stacked cards on mobile',
        'Each row showing name, CreditSense Score, risk band and any fraud flag',
        'A full applicant view with score, affordability, fraud and history',
        'Approve, reject or send to manual review, with the reasoning captured for audit',
      ]}
    />
  )
}
