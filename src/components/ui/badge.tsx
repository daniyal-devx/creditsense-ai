import * as React from 'react'
import { cn } from '@/lib/utils/cn'

export type BadgeTone =
  | 'neutral'
  | 'primary'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'

const TONES: Record<BadgeTone, { soft: string; solid: string; outline: string }> = {
  neutral: {
    soft: 'bg-muted text-muted-foreground',
    solid: 'bg-foreground text-background',
    outline: 'border-border-strong text-foreground',
  },
  primary: {
    soft: 'bg-primary-soft text-primary-soft-foreground',
    solid: 'bg-primary text-primary-foreground',
    outline: 'border-primary text-primary',
  },
  success: {
    soft: 'bg-success-soft text-success-soft-foreground',
    solid: 'bg-success text-success-foreground',
    outline: 'border-success text-success',
  },
  warning: {
    soft: 'bg-warning-soft text-warning-soft-foreground',
    solid: 'bg-warning text-warning-foreground',
    outline: 'border-warning text-warning',
  },
  danger: {
    soft: 'bg-danger-soft text-danger-soft-foreground',
    solid: 'bg-danger text-danger-foreground',
    outline: 'border-danger text-danger',
  },
  info: {
    soft: 'bg-info-soft text-info-soft-foreground',
    solid: 'bg-info text-info-foreground',
    outline: 'border-info text-info',
  },
}

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone
  variant?: 'soft' | 'solid' | 'outline'
  size?: 'sm' | 'md'
  /**
   * An icon shown before the label.
   *
   * Strongly encouraged on anything conveying status: it is what keeps the
   * meaning readable when the badge is printed in greyscale or seen by
   * someone who cannot distinguish the tone colours.
   */
  icon?: React.ReactNode
  /** Small filled circle before the label — a lighter-weight alternative to an icon. */
  dot?: boolean
}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { className, tone = 'neutral', variant = 'soft', size = 'md', icon, dot, children, ...props },
  ref,
) {
  return (
    <span
      ref={ref}
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded-full font-medium leading-none',
        size === 'sm' ? 'px-2 py-1 text-[11px]' : 'px-2.5 py-1.5 text-xs',
        variant === 'outline' ? 'border bg-transparent' : TONES[tone][variant],
        variant === 'outline' && TONES[tone].outline,
        '[&_svg]:shrink-0',
        size === 'sm' ? '[&_svg]:size-3' : '[&_svg]:size-3.5',
        className,
      )}
      {...props}
    >
      {dot && (
        <span
          className={cn('size-1.5 shrink-0 rounded-full bg-current')}
          aria-hidden="true"
        />
      )}
      {icon}
      <span className="truncate">{children}</span>
    </span>
  )
})
