'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import * as React from 'react'
import { ChevronsUpDown, LogOut, Settings, User } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { roleLabel } from '@/lib/auth/roles'
import { Avatar } from '@/components/ui/avatar'
import {
  DropdownContent,
  DropdownItem,
  DropdownMenu,
  DropdownSeparator,
  DropdownTrigger,
} from '@/components/ui/dropdown-menu'
import { useToast } from '@/components/ui/toast'
import type { ShellUser } from './app-shell'

/**
 * The signed-in user's identity and account actions.
 *
 * Sign-out posts to the API rather than clearing something client-side —
 * the session cookie is httpOnly, so only the server can end the session.
 * That route lands in Phase 2; until then this degrades to a clean no-op
 * with a message rather than a broken button.
 */
export function UserMenu({ user, compact = false }: { user: ShellUser; compact?: boolean }) {
  const router = useRouter()
  const toast = useToast()
  const [signingOut, setSigningOut] = React.useState(false)

  const signOut = async () => {
    setSigningOut(true)
    try {
      const res = await fetch('/api/auth/logout', { method: 'POST' })
      if (res.ok) {
        router.push('/login')
        router.refresh()
        return
      }
      if (res.status === 404) {
        toast.info('Not available yet', 'Sign-out arrives with authentication in Phase 2.')
        return
      }
      toast.error('Could not sign out', 'Please try again.')
    } catch {
      toast.error('Could not sign out', 'Check your connection and try again.')
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <DropdownMenu className={compact ? undefined : 'w-full'}>
      <DropdownTrigger
        aria-label={`Account menu for ${user.name}`}
        className={cn(
          'text-left hover:bg-accent',
          compact ? 'px-1.5' : 'w-full gap-3 px-2 py-1.5',
        )}
      >
        <Avatar name={user.name} src={user.avatarUrl} size={compact ? 'sm' : 'md'} />
        {!compact && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium leading-tight text-foreground">
                {user.name}
              </span>
              <span className="block truncate text-xs leading-tight text-muted-foreground">
                {roleLabel(user.role)}
              </span>
            </span>
            <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </>
        )}
      </DropdownTrigger>

      <DropdownContent align={compact ? 'end' : 'start'} className="w-60">
        <div className="border-b border-border px-3 py-2.5">
          <p className="truncate text-sm font-medium text-foreground">{user.name}</p>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          <p className="mt-1.5 inline-flex rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-medium text-primary-soft-foreground">
            {roleLabel(user.role)}
          </p>
        </div>

        <div className="pt-1">
          <Link href="/settings" className="block">
            <DropdownItem icon={<User />}>Profile</DropdownItem>
          </Link>
          <Link href="/settings" className="block">
            <DropdownItem icon={<Settings />}>Settings</DropdownItem>
          </Link>
        </div>

        <DropdownSeparator />

        <DropdownItem icon={<LogOut />} tone="danger" onSelect={signOut} disabled={signingOut}>
          {signingOut ? 'Signing out…' : 'Sign out'}
        </DropdownItem>
      </DropdownContent>
    </DropdownMenu>
  )
}
