'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import type { ColumnDef } from '@tanstack/react-table'
import { MoreVertical, ShieldOff, UserCheck } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { Badge, type BadgeTone } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { ConfirmModal } from '@/components/ui/modal'
import { DataTable } from '@/components/ui/data-table'
import {
  DropdownContent,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
  DropdownSeparator,
  DropdownTrigger,
} from '@/components/ui/dropdown-menu'
import { useToast } from '@/components/ui/toast'
import { ROLES, ROLE_DEFINITIONS } from '@/lib/auth/roles'
import type { ManagedUser } from '@/lib/db/users'
import { formatRelative } from '@/lib/utils/format'

const STATUS_TONE: Record<ManagedUser['status'], BadgeTone> = {
  active: 'success',
  unverified: 'warning',
  suspended: 'danger',
}

const STATUS_LABEL: Record<ManagedUser['status'], string> = {
  active: 'Active',
  unverified: 'Unverified',
  suspended: 'Suspended',
}

export function UsersTable({
  users,
  currentUserId,
}: {
  users: ManagedUser[]
  currentUserId: string
}) {
  const router = useRouter()
  const toast = useToast()
  const [pending, setPending] = React.useState<string | null>(null)
  const [confirmSuspend, setConfirmSuspend] = React.useState<ManagedUser | null>(null)

  const act = React.useCallback(
    async (userId: string, body: Record<string, unknown>, successMessage: string) => {
      setPending(userId)
      try {
        const response = await fetch(`/api/admin/users/${userId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const data = await response.json()

        if (!response.ok) {
          toast.error('Could not apply that change', data.error)
          return
        }

        toast.success(successMessage)
        // Re-fetch the server component so the table reflects the new state.
        router.refresh()
      } catch {
        toast.error('Could not reach the server', 'Check your connection and try again.')
      } finally {
        setPending(null)
        setConfirmSuspend(null)
      }
    },
    [router, toast],
  )

  const renderActions = React.useCallback(
    (user: ManagedUser) => {
      const isSelf = user.id === currentUserId
      return (
        <DropdownMenu>
          <DropdownTrigger
            aria-label={`Actions for ${user.fullName}`}
            className="justify-center px-0 text-muted-foreground hover:bg-accent hover:text-foreground size-10"
          >
            <MoreVertical className="size-4" aria-hidden="true" />
          </DropdownTrigger>

          <DropdownContent>
            <DropdownLabel>Change role</DropdownLabel>
            {ROLES.map((role) => (
              <DropdownItem
                key={role}
                disabled={pending === user.id || user.role === role}
                onSelect={() =>
                  act(
                    user.id,
                    { action: 'change_role', role },
                    `${user.fullName} is now a ${ROLE_DEFINITIONS[role].label}`,
                  )
                }
              >
                {ROLE_DEFINITIONS[role].label}
                {user.role === role && <span className="sr-only"> (current)</span>}
              </DropdownItem>
            ))}

            <DropdownSeparator />

            {user.status === 'suspended' ? (
              <DropdownItem
                icon={<UserCheck />}
                disabled={pending === user.id}
                onSelect={() =>
                  act(user.id, { action: 'reactivate' }, `${user.fullName} can sign in again`)
                }
              >
                Reactivate
              </DropdownItem>
            ) : (
              <DropdownItem
                icon={<ShieldOff />}
                tone="danger"
                // Suspending yourself would lock you out of the page you are
                // standing on, so the option is simply not offered.
                disabled={pending === user.id || isSelf || user.status === 'unverified'}
                onSelect={() => setConfirmSuspend(user)}
              >
                {isSelf ? 'Cannot suspend yourself' : 'Suspend access'}
              </DropdownItem>
            )}
          </DropdownContent>
        </DropdownMenu>
      )
    },
    [act, currentUserId, pending],
  )

  const columns = React.useMemo<ColumnDef<ManagedUser, unknown>[]>(
    () => [
      {
        accessorKey: 'fullName',
        header: 'User',
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <Avatar name={row.original.fullName} src={row.original.avatarUrl} size="sm" />
            <div className="min-w-0">
              <p className="truncate font-medium">
                {row.original.fullName}
                {row.original.id === currentUserId && (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">(you)</span>
                )}
              </p>
              <p className="truncate text-xs text-muted-foreground">{row.original.email}</p>
            </div>
          </div>
        ),
      },
      {
        accessorKey: 'role',
        header: 'Role',
        cell: ({ row }) => (
          <Badge tone="primary" size="sm">
            {ROLE_DEFINITIONS[row.original.role].label}
          </Badge>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => (
          <Badge tone={STATUS_TONE[row.original.status]} size="sm">
            {STATUS_LABEL[row.original.status]}
          </Badge>
        ),
      },
      {
        id: 'providers',
        header: 'Sign-in',
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {row.original.authProviders
              .map((p) => (p === 'google' ? 'Google' : 'Password'))
              .join(', ')}
          </span>
        ),
      },
      {
        accessorKey: 'lastLoginAt',
        header: 'Last seen',
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original.lastLoginAt ? formatRelative(row.original.lastLoginAt) : 'Never'}
          </span>
        ),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => renderActions(row.original),
      },
    ],
    [currentUserId, renderActions],
  )

  return (
    <>
      <DataTable
        caption="Users and their roles"
        data={users}
        columns={columns}
        getRowId={(row) => row.id}
        searchable
        searchPlaceholder="Search by name or email…"
        pageSize={20}
        emptyTitle="No users yet"
        emptyDescription="Users appear here once they sign up."
        renderMobileCard={(user) => (
          <Card className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar name={user.fullName} src={user.avatarUrl} size="sm" />
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {user.fullName}
                    {user.id === currentUserId && (
                      <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                        (you)
                      </span>
                    )}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                </div>
              </div>
              <div className="shrink-0">{renderActions(user)}</div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
              <Badge tone="primary" size="sm">
                {ROLE_DEFINITIONS[user.role].label}
              </Badge>
              <Badge tone={STATUS_TONE[user.status]} size="sm">
                {STATUS_LABEL[user.status]}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {user.lastLoginAt ? formatRelative(user.lastLoginAt) : 'Never signed in'}
              </span>
            </div>
          </Card>
        )}
      />

      <ConfirmModal
        open={confirmSuspend !== null}
        onClose={() => setConfirmSuspend(null)}
        loading={pending === confirmSuspend?.id}
        tone="danger"
        title={`Suspend ${confirmSuspend?.fullName}?`}
        description="They will be signed out immediately on every device and will not be able to sign back in until an administrator reactivates them."
        confirmLabel="Suspend access"
        onConfirm={() => {
          if (confirmSuspend) {
            void act(
              confirmSuspend.id,
              { action: 'suspend' },
              `${confirmSuspend.fullName} has been suspended`,
            )
          }
        }}
      />
    </>
  )
}
