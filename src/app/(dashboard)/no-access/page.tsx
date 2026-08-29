import type { Metadata } from 'next'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { NoPermissionState } from '@/components/ui/states'
import { PageHeader } from '@/components/layout/page-header'
import { requireUser } from '@/lib/auth/guard'
import { ROLES, ROLE_DEFINITIONS, can, type Permission } from '@/lib/auth/roles'

export const metadata: Metadata = { title: 'No access' }
export const dynamic = 'force-dynamic'

/**
 * Where `requirePermission` sends someone whose role does not cover a page.
 *
 * It names the roles that *do* have the permission, so the user knows exactly
 * what to ask an administrator for instead of filing a vague "I can't see the
 * fraud queue" ticket.
 */
export default async function NoAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ permission?: string }>
}) {
  const user = await requireUser()
  const { permission } = await searchParams

  const rolesWithAccess = permission
    ? ROLES.filter((role) => can(role, permission as Permission)).map(
        (role) => ROLE_DEFINITIONS[role].label,
      )
    : []

  return (
    <>
      <PageHeader
        title="Access restricted"
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'No access' }]}
      />

      <Card>
        <NoPermissionState
          size="page"
          title="Your role does not include this area"
          description={
            <>
              You are signed in as a{' '}
              <strong className="font-medium text-foreground">
                {ROLE_DEFINITIONS[user.role].label}
              </strong>
              .{' '}
              {rolesWithAccess.length > 0 ? (
                <>
                  This area is open to the{' '}
                  <strong className="font-medium text-foreground">
                    {rolesWithAccess.join(' and ')}
                  </strong>{' '}
                  {rolesWithAccess.length === 1 ? 'role' : 'roles'}. Ask an administrator if you
                  need it.
                </>
              ) : (
                'Ask an administrator if you need access.'
              )}
            </>
          }
          action={
            <Link href="/dashboard" className={buttonVariants()}>
              Back to your dashboard
            </Link>
          }
        />
      </Card>
    </>
  )
}
