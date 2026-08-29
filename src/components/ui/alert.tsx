import * as React from 'react'
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

/**
 * An inline banner. Unlike a toast, an alert is part of the page and stays
 * put — use it for a condition of the view ("3 applications need review"),
 * not for confirming an action the user just took.
 */

export type AlertTone = 'info' | 'success' | 'warning' | 'danger'

const TONES: Record<AlertTone, { wrap: string; icon: React.ReactNode; iconClass: string }> = {
  info: {
    wrap: 'border-info/30 bg-info-soft text-info-soft-foreground',
    icon: <Info />,
    iconClass: 'text-info',
  },
  success: {
    wrap: 'border-success/30 bg-success-soft text-success-soft-foreground',
    icon: <CheckCircle2 />,
    iconClass: 'text-success',
  },
  warning: {
    wrap: 'border-warning/40 bg-warning-soft text-warning-soft-foreground',
    icon: <AlertTriangle />,
    iconClass: 'text-warning',
  },
  danger: {
    wrap: 'border-danger/30 bg-danger-soft text-danger-soft-foreground',
    icon: <XCircle />,
    iconClass: 'text-danger',
  },
}

export interface AlertProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  tone?: AlertTone
  title?: React.ReactNode
  /** Overrides the tone's default icon. Pass `null` to drop it entirely. */
  icon?: React.ReactNode | null
  /** Buttons or links, laid out under the copy. */
  actions?: React.ReactNode
}

export function Alert({
  className,
  tone = 'info',
  title,
  icon,
  actions,
  children,
  ...props
}: AlertProps) {
  const config = TONES[tone]
  const resolvedIcon = icon === undefined ? config.icon : icon

  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn('flex gap-3 rounded-lg border p-3.5 sm:p-4', config.wrap, className)}
      {...props}
    >
      {resolvedIcon && (
        <span className={cn('mt-px shrink-0 [&_svg]:size-5', config.iconClass)} aria-hidden="true">
          {resolvedIcon}
        </span>
      )}

      <div className="min-w-0 flex-1">
        {title && <p className="text-sm font-semibold leading-snug">{title}</p>}
        {children && (
          <div className={cn('text-sm leading-relaxed', title && 'mt-1', !title && 'font-medium')}>
            {children}
          </div>
        )}
        {actions && <div className="mt-3 flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  )
}
