import type { Metadata } from 'next'
import { PhasePlaceholder } from '@/components/layout/phase-placeholder'

export const metadata: Metadata = { title: 'FraudSense' }

export default function FraudPage() {
  return (
    <PhasePlaceholder
      title="FraudSense"
      description="Can we trust this application? Anomaly detection and the relationship graph."
      phaseNumber={5}
      breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'FraudSense' }]}
      whatArrives={[
        'Anomaly detection on velocity spikes, circular transfers and synthetic activity',
        'A relationship graph linking applicants by device, number, address and counterparty',
        'Cluster detection that surfaces coordinated ring fraud',
        'An interactive canvas on desktop, with a tap-to-inspect node list on mobile',
      ]}
    />
  )
}
