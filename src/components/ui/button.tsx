import * as React from 'react'
import { cn } from '@/lib/utils/cn'
import { Spinner } from './spinner'

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'outline'
  | 'ghost'
  | 'danger'
  | 'success'
  | 'link'

export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm'

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-primary text-primary-foreground shadow-e1 hover:bg-primary-hover active:bg-primary-hover disabled:bg-primary/50',
  secondary:
    'bg-surface-raised text-foreground border border-border shadow-e1 hover:bg-accent active:bg-accent',
  outline:
    'border border-border-strong bg-transparent text-foreground hover:bg-accent active:bg-accent',
  ghost: 'bg-transparent text-foreground hover:bg-accent active:bg-accent',
  danger:
    'bg-danger text-danger-foreground shadow-e1 hover:brightness-110 active:brightness-95 disabled:bg-danger/50',
  success:
    'bg-success text-success-foreground shadow-e1 hover:brightness-110 active:brightness-95 disabled:bg-success/50',
  link: 'bg-transparent text-primary underline-offset-4 hover:underline p-0 h-auto min-h-0 shadow-none',
}

/**
 * Sizes.
 *
 * `md` is 44px tall on every breakpoint — the minimum comfortable tap target,
 * and the default everywhere a finger might reach it. `sm` drops to 36px and
 * is reserved for dense desktop surfaces (table row actions, toolbars) that
 * become cards on mobile anyway.
 */
const SIZES: Record<ButtonSize, string> = {
  sm: 'h-9 min-h-9 px-3 text-sm gap-1.5 rounded-md',
  md: 'h-11 min-h-11 px-4 text-sm gap-2 rounded-lg sm:h-10 sm:min-h-10',
  lg: 'h-12 min-h-12 px-6 text-base gap-2 rounded-lg',
  icon: 'h-11 w-11 min-h-11 min-w-11 rounded-lg sm:h-10 sm:w-10 sm:min-h-10 sm:min-w-10',
  'icon-sm': 'h-9 w-9 min-h-9 min-w-9 rounded-md',
}

const BASE =
  // `min-w-0` matters: without it a long label under `whitespace-nowrap`
  // pushes the button past the viewport instead of ellipsizing, which broke
  // the "no horizontal scrolling, ever" rule at 320px.
  'relative inline-flex min-w-0 select-none items-center justify-center whitespace-nowrap font-medium ' +
  'transition-[background-color,border-color,color,box-shadow,transform] duration-150 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ' +
  'disabled:pointer-events-none disabled:opacity-55 ' +
  'active:scale-[0.98] motion-reduce:active:scale-100 ' +
  '[&_svg]:pointer-events-none [&_svg]:shrink-0'

export function buttonVariants({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className,
}: {
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
  className?: string
} = {}) {
  return cn(BASE, VARIANTS[variant], SIZES[size], fullWidth && 'w-full', className)
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Full width — the default treatment for primary actions on mobile. */
  fullWidth?: boolean
  /**
   * Shows a spinner and blocks interaction. The label stays in the DOM at
   * zero opacity so the button does not change width mid-action.
   */
  loading?: boolean
  /** Announced to screen readers while `loading` is true. */
  loadingText?: string
  leadingIcon?: React.ReactNode
  trailingIcon?: React.ReactNode
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant = 'primary',
    size = 'md',
    fullWidth,
    loading = false,
    loadingText = 'Working…',
    leadingIcon,
    trailingIcon,
    disabled,
    children,
    type = 'button',
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonVariants({ variant, size, fullWidth, className })}
      {...props}
    >
      {loading && (
        <span className="absolute inset-0 flex items-center justify-center">
          <Spinner className="size-4" />
          <span className="sr-only">{loadingText}</span>
        </span>
      )}
      <span
        className={cn(
          'inline-flex min-w-0 items-center justify-center gap-2 truncate',
          loading && 'invisible',
        )}
      >
        {leadingIcon}
        {children}
        {trailingIcon}
      </span>
    </button>
  )
})
