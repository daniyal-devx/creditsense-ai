import type { Metadata } from 'next'
import { PhasePlaceholder } from '@/components/layout/phase-placeholder'

export const metadata: Metadata = { title: 'Users & Roles' }

export default function AdminUsersPage() {
  return (
    <PhasePlaceholder
      title="Users & roles"
      description="Invite users, assign roles and revoke access."
      phaseNumber={2}
      breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Users & Roles' }]}
      whatArrives={[
        'Invite a teammate by email and assign them a role',
        'Loan Officer, Risk Analyst, Fraud Analyst and Administrator',
        'Revoke access, which invalidates every session that user holds',
        'Server-side permission checks on every data path, not just hidden buttons',
      ]}
    />
  )
}
