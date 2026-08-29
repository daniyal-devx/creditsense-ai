import * as React from 'react'
import { AlertTriangle, Inbox, Lock, RefreshCw, SearchX, WifiOff } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { Button } from './button'

/**
 * The four states every view in this product must design for:
 * loading (see <Skeleton>), empty, error, and no-permission.
 *
 * "Never a blank screen" is a hard rule here. A loan officer staring at an
 * empty rectangle cannot tell whether there is genuinely no work in the queue,
 * whether the request failed, or whether they simply are not allowed to see
 * it — and those three need three different reactions from them.
 */

interface BaseStateProps {
  title: string
  description?: React.ReactNode
  /** Primary action. Keep the label a verb: "Try again", "Clear filters". */
  action?: React.ReactNode
  /** A quieter secondary action beside the primary one. */
  secondaryAction?: React.ReactNode
  className?: string
  /** `inline` for inside a card; `page` for a whole empty view. */
  size?: 'inline' | 'page'
}

function StateShell({
  icon,
  iconClass,
  title,
  description,
  action,
  secondaryAction,
  className,
  size = 'inline',
  role,
}: BaseStateProps & { icon: React.ReactNode; iconClass?: string; role?: string }) {
  return (
    <div
      role={role}
      className={cn(
        'flex flex-col items-center justify-center text-center',
        size === 'page' ? 'min-h-[60vh] px-4 py-12' : 'px-4 py-10 sm:py-12',
        className,
      )}
    >
      <div
        className={cn(
          'mb-4 flex size-12 items-center justify-center rounded-full [&_svg]:size-6',
          iconClass ?? 'bg-muted text-muted-foreground',
        )}
        aria-hidden="true"
      >
        {icon}
      </div>

      <h3 className="text-balance text-base font-semibold text-foreground sm:text-lg">{title}</h3>

      {description && (
        <p className="mt-1.5 max-w-sm text-pretty text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}

      {(action || secondaryAction) && (
        <div className="mt-6 flex w-full flex-col-reverse items-stretch gap-2 sm:w-auto sm:flex-row sm:items-center">
          {secondaryAction}
          {action}
        </div>
      )}
    </div>
  )
}

/** Nothing here yet — and that is a normal, expected outcome. */
export function EmptyState({
  icon,
  ...props
}: BaseStateProps & { icon?: React.ReactNode }) {
  return <StateShell icon={icon ?? <Inbox />} {...props} />
}

/** A filter or search returned nothing. Distinct from "there is no data at all". */
export function NoResultsState({
  onClear,
  ...props
}: Omit<BaseStateProps, 'title' | 'description'> & {
  title?: string
  description?: React.ReactNode
  onClear?: () => void
}) {
  return (
    <StateShell
      icon={<SearchX />}
      title={props.title ?? 'No matches'}
      description={
        props.description ?? 'Nothing matched the filters you have applied. Try widening them.'
      }
      action={
        onClear ? (
          <Button variant="secondary" onClick={onClear} fullWidth>
            Clear filters
          </Button>
        ) : (
          props.action
        )
      }
      {...props}
    />
  )
}

/** Something failed. Always offer a way to retry. */
export function ErrorState({
  onRetry,
  error,
  ...props
}: Omit<BaseStateProps, 'title' | 'description'> & {
  title?: string
  description?: React.ReactNode
  onRetry?: () => void
  /** The underlying error. Shown only in development — never leak it to a lender. */
  error?: unknown
}) {
  const detail =
    process.env.NODE_ENV === 'development' && error
      ? error instanceof Error
        ? error.message
        : String(error)
      : null

  return (
    <StateShell
      role="alert"
      icon={<AlertTriangle />}
      iconClass="bg-danger-soft text-danger-soft-foreground"
      title={props.title ?? 'Something went wrong'}
      description={
        <>
          {props.description ??
            'We could not load this. It is usually temporary — try again in a moment.'}
          {detail && (
            <span className="mt-3 block rounded-md bg-muted px-3 py-2 text-left font-mono text-xs text-muted-foreground">
              {detail}
            </span>
          )}
        </>
      }
      action={
        onRetry ? (
          <Button variant="secondary" onClick={onRetry} leadingIcon={<RefreshCw className="size-4" />} fullWidth>
            Try again
          </Button>
        ) : (
          props.action
        )
      }
      {...props}
    />
  )
}

/**
 * The user is authenticated but their role does not grant access.
 *
 * Deliberately distinct from an error: nothing is broken, and telling them to
 * retry would be misleading. Name the role requirement so they know who to ask.
 */
export function NoPermissionState({
  requiredRole,
  ...props
}: Omit<BaseStateProps, 'title' | 'description'> & {
  title?: string
  description?: React.ReactNode
  requiredRole?: string
}) {
  return (
    <StateShell
      icon={<Lock />}
      iconClass="bg-warning-soft text-warning-soft-foreground"
      title={props.title ?? 'You do not have access to this'}
      description={
        props.description ??
        (requiredRole
          ? `This area is limited to the ${requiredRole} role. Ask an administrator if you need access.`
          : 'Your role does not include this area. Ask an administrator if you need access.')
      }
      {...props}
    />
  )
}

/** The request could not reach the server at all. */
export function OfflineState({
  onRetry,
  ...props
}: Omit<BaseStateProps, 'title' | 'description'> & {
  title?: string
  description?: React.ReactNode
  onRetry?: () => void
}) {
  return (
    <StateShell
      role="alert"
      icon={<WifiOff />}
      iconClass="bg-warning-soft text-warning-soft-foreground"
      title={props.title ?? 'No connection'}
      description={
        props.description ?? 'We cannot reach the server. Check your connection and try again.'
      }
      action={
        onRetry ? (
          <Button variant="secondary" onClick={onRetry} leadingIcon={<RefreshCw className="size-4" />} fullWidth>
            Try again
          </Button>
        ) : undefined
      }
      {...props}
    />
  )
}
