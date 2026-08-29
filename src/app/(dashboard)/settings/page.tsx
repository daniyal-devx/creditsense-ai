import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Monitor, Palette, ShieldCheck, User } from 'lucide-react'
import { PageHeader, Section } from '@/components/layout/page-header'
import { ThemeSegmentedControl } from '@/components/layout/theme-toggle'
import { ChangePasswordForm } from '@/components/auth/change-password-form'
import { Alert } from '@/components/ui/alert'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeaderRow } from '@/components/ui/card'
import { ROLE_DEFINITIONS } from '@/lib/auth/roles'
import { getSession, listActiveSessions } from '@/lib/auth/session'
import { describeUserAgent } from '@/lib/email/templates'
import { formatDateTime, formatRelative } from '@/lib/utils/format'

export const metadata: Metadata = { title: 'Settings' }
export const dynamic = 'force-dynamic'

/**
 * Account settings.
 *
 * The active-sessions list is here deliberately: it is the only way a user can
 * discover that someone else is signed in as them, and changing the password
 * is the button that ends it.
 */
export default async function SettingsPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const { user } = session
  const role = ROLE_DEFINITIONS[user.role]
  const sessions = await listActiveSessions(user.id, session.sessionId)

  return (
    <>
      <PageHeader
        title="Settings"
        description="Your profile, security and appearance preferences."
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Settings' }]}
      />

      <div className="flex max-w-3xl flex-col gap-6">
        {/* ---------- profile ---------- */}
        <Section>
          <Card>
            <CardHeaderRow
              title={
                <span className="flex items-center gap-2">
                  <User className="size-4 text-muted-foreground" aria-hidden="true" />
                  Profile
                </span>
              }
              description="How you appear on the decisions you record."
            />
            <CardContent className="flex flex-col gap-5">
              <div className="flex items-center gap-4">
                <Avatar name={user.fullName} src={user.avatarUrl} size="xl" />
                <div className="min-w-0">
                  <p className="truncate text-lg font-semibold">{user.fullName}</p>
                  <p className="truncate text-sm text-muted-foreground">{user.email}</p>
                  <Badge tone="primary" size="sm" className="mt-2">
                    {role.label}
                  </Badge>
                </div>
              </div>

              <dl className="grid grid-cols-1 gap-4 border-t border-border pt-4 sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted-foreground">Email verified</dt>
                  <dd className="mt-0.5 text-sm font-medium">
                    {user.emailVerifiedAt ? formatDateTime(user.emailVerifiedAt) : 'Not verified'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Account status</dt>
                  <dd className="mt-0.5 text-sm font-medium capitalize">{user.status}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </Section>

        {/* ---------- security ---------- */}
        <Section>
          <Card>
            <CardHeaderRow
              title={
                <span className="flex items-center gap-2">
                  <ShieldCheck className="size-4 text-muted-foreground" aria-hidden="true" />
                  Password
                </span>
              }
              description="Changing your password signs you out on every other device."
            />
            <CardContent>
              <ChangePasswordForm />
            </CardContent>
          </Card>
        </Section>

        {/* ---------- active sessions ---------- */}
        <Section>
          <Card>
            <CardHeaderRow
              title={
                <span className="flex items-center gap-2">
                  <Monitor className="size-4 text-muted-foreground" aria-hidden="true" />
                  Active sessions
                </span>
              }
              description="Devices currently signed in to your account."
              actions={<Badge tone="neutral">{sessions.length}</Badge>}
            />
            <ul className="divide-y divide-border border-t border-border">
              {sessions.map((s) => (
                <li key={s.id} className="flex items-start justify-between gap-3 px-4 py-3.5 sm:px-5">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      {describeUserAgent(s.userAgent)}
                      {s.isCurrent && (
                        <Badge tone="success" size="sm">
                          This device
                        </Badge>
                      )}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {s.ipAddress ?? 'Unknown IP'} · signed in {formatRelative(s.createdAt)}
                    </p>
                  </div>
                  <p className="shrink-0 text-xs text-muted-foreground">
                    {formatRelative(s.lastSeenAt)}
                  </p>
                </li>
              ))}
            </ul>
            {sessions.length > 1 && (
              <CardContent className="pt-4">
                <Alert tone="info">
                  Do not recognise one of these? Change your password above — that ends every
                  session except this one.
                </Alert>
              </CardContent>
            )}
          </Card>
        </Section>

        {/* ---------- appearance ---------- */}
        <Section>
          <Card>
            <CardHeaderRow
              title={
                <span className="flex items-center gap-2">
                  <Palette className="size-4 text-muted-foreground" aria-hidden="true" />
                  Appearance
                </span>
              }
              description="Applies immediately and is remembered on this device."
            />
            <CardContent>
              <ThemeSegmentedControl />
            </CardContent>
          </Card>
        </Section>

        {/* ---------- permissions ---------- */}
        <Section>
          <Card>
            <CardHeaderRow
              title="Role & access"
              description="What your role is allowed to do."
            />
            <CardContent className="flex flex-col gap-4">
              <p className="text-sm leading-relaxed text-muted-foreground">{role.description}</p>
              <div>
                <p className="mb-2 text-sm font-medium">Permissions</p>
                <ul className="flex flex-wrap gap-1.5">
                  {role.permissions.map((permission) => (
                    <li key={permission}>
                      <Badge tone="neutral" size="sm" className="font-mono">
                        {permission}
                      </Badge>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  Permissions are checked on the server on every data access. Hiding a button is
                  not access control.
                </p>
              </div>
            </CardContent>
          </Card>
        </Section>
      </div>
    </>
  )
}
