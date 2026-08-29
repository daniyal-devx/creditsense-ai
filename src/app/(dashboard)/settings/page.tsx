'use client'

import { Palette, ShieldCheck, User } from 'lucide-react'
import { PageHeader, Section } from '@/components/layout/page-header'
import { ThemeSegmentedControl } from '@/components/layout/theme-toggle'
import { Alert } from '@/components/ui/alert'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeaderRow } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { getPlaceholderUser } from '@/lib/auth/placeholder-user'
import { ROLE_DEFINITIONS } from '@/lib/auth/roles'

/**
 * Settings.
 *
 * Appearance is genuinely functional in Phase 0 — it is the control that
 * proves the theme system works. Profile and security are read-only until
 * Phase 2 puts a real account behind them, and say so rather than showing
 * inputs that quietly do nothing.
 */
export default function SettingsPage() {
  const user = getPlaceholderUser()
  const role = ROLE_DEFINITIONS[user.role]

  return (
    <>
      <PageHeader
        title="Settings"
        description="Your profile, appearance and security preferences."
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Settings' }]}
      />

      <div className="flex max-w-3xl flex-col gap-6">
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
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Choosing <strong className="font-medium text-foreground">System</strong> follows
                your device setting, so the app switches with it at sunset.
              </p>
            </CardContent>
          </Card>
        </Section>

        <Section>
          <Card>
            <CardHeaderRow
              title={
                <span className="flex items-center gap-2">
                  <User className="size-4 text-muted-foreground" aria-hidden="true" />
                  Profile
                </span>
              }
              description="How you appear on decisions you record."
              actions={<Badge tone="neutral">Phase 2</Badge>}
            />
            <CardContent className="flex flex-col gap-5">
              <div className="flex items-center gap-4">
                <Avatar name={user.name} src={user.avatarUrl} size="xl" />
                <div className="min-w-0">
                  <p className="truncate font-medium">{user.name}</p>
                  <p className="truncate text-sm text-muted-foreground">{user.email}</p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Input label="Full name" defaultValue={user.name} readOnly />
                <Input label="Email" type="email" defaultValue={user.email} readOnly />
              </div>

              <Alert tone="info" title="Editing arrives with authentication">
                Signup, email verification, Google sign-in and password management all land in
                Phase 2. Until then this is a placeholder account.
              </Alert>
            </CardContent>
          </Card>
        </Section>

        <Section>
          <Card>
            <CardHeaderRow
              title={
                <span className="flex items-center gap-2">
                  <ShieldCheck className="size-4 text-muted-foreground" aria-hidden="true" />
                  Role & access
                </span>
              }
              description="What your role is allowed to do."
            />
            <CardContent className="flex flex-col gap-4">
              <div>
                <Badge tone="primary">{role.label}</Badge>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {role.description}
                </p>
              </div>

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
