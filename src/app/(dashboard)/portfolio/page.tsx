import type { Metadata } from 'next'
import { PhasePlaceholder } from '@/components/layout/phase-placeholder'

export const metadata: Metadata = { title: 'Portfolio Risk' }

export default function PortfolioPage() {
  return (
    <PhasePlaceholder
      title="Portfolio risk"
      description="How risk is distributed across every customer, and how it is shifting over time."
      phaseNumber={7}
      breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Portfolio Risk' }]}
      whatArrives={[
        'Risk band distribution across the whole book',
        'Score migration over time — who is getting better or worse',
        'Default rate and exposure by persona and by region',
        'Full multi-series charts on desktop, simplified swipeable charts on mobile',
      ]}
    />
  )
}
