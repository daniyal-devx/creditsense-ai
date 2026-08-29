import type { Metadata } from 'next'
import { ShieldAlert, UserCheck, UserCog, Users } from 'lucide-react'
import { PageHeader, Section } from '@/components/layout/page-header'
import { Alert } from '@/components/ui/alert'
import { Card, CardContent } from '@/components/ui/card'
import { requirePermission } from '@/lib/auth/guard'
import { ROLE_DEFINITIONS, ROLES } from '@/lib/auth/roles'
import { getUserStats, listUsers } from '@/lib/db/users'
import { formatNumber } from '@/lib/utils/format'
import { UsersTable } from './users-table'

export const metadata: Metadata = { title: 'Users & Roles' }
export const dynamic = 'force-dynamic'

/**
 * User and role administration.
 *
 * `requirePermission` is the access control here. The nav item is already
 * hidden from non-admins, but that is cosmetic — anyone can type this URL, so
 * the check has to happen on the server before a single row is read.
 */
export default async function AdminUsersPage() {
  const currentUser = await requirePermission('users:manage')

  const [users, stats] = await Promise.all([listUsers(), getUserStats()])

  const tiles = [
    { icon: Users, label: 'Total users', value: stats.total, tone: 'text-muted-foreground' },
    { icon: UserCheck, label: 'Active', value: stats.active, tone: 'text-success' },
    { icon: UserCog, label: 'Awaiting verification', value: stats.unverified, tone: 'text-warning' },
    { icon: ShieldAlert, label: 'Suspended', value: stats.suspended, tone: 'text-danger' },
  ]

  return (
    <>
      <PageHeader
        title="Users & roles"
        description="Who can sign in, and what their role allows them to do."
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Users & Roles' }]}
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
                  <p className="mt-2 text-2xl font-semibold tabular-nums">
                    {formatNumber(tile.value)}
                  </p>
                </CardContent>
              </Card>
            )
          })}
        </div>

        {stats.suspended > 0 && (
          <Alert tone="warning" title={`${stats.suspended} suspended ${stats.suspended === 1 ? 'account' : 'accounts'}`}>
            Suspended users are signed out on every device and cannot sign back in until
            reactivated.
          </Alert>
        )}

        <Section title="All users">
          <UsersTable users={users} currentUserId={currentUser.id} />
        </Section>

        <Section
          title="What each role can do"
          description="Permissions are enforced on the server on every data access."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            {ROLES.map((role) => {
              const definition = ROLE_DEFINITIONS[role]
              const count = stats.byRole[role] ?? 0
              return (
                <Card key={role}>
                  <CardContent className="p-4 pt-4 sm:p-5 sm:pt-5">
                    <div className="flex items-baseline justify-between gap-3">
                      <h3 className="font-semibold">{definition.label}</h3>
                      <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                        {count} {count === 1 ? 'user' : 'users'}
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                      {definition.description}
                    </p>
                    <ul className="mt-3 flex flex-wrap gap-1.5">
                      {definition.permissions.map((permission) => (
                        <li
                          key={permission}
                          className="rounded-full bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground"
                        >
                          {permission}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </Section>
      </div>
    </>
  )
}
