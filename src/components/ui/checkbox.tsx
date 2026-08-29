'use client'

import * as React from 'react'
import { Check, Minus } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  label?: React.ReactNode
  description?: React.ReactNode
  /** Renders the dash state used by "select all" headers on partial selection. */
  indeterminate?: boolean
}

/**
 * The visible box is a styled `<span>` sitting over a visually hidden but real
 * `<input type="checkbox">`, so form submission, keyboard interaction and
 * screen-reader semantics are all native. The whole row is the label, which
 * makes the tap target the full width rather than a 16px square.
 */
export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { className, label, description, indeterminate = false, disabled, id, ...props },
  forwardedRef,
) {
  const generatedId = React.useId()
  const inputId = id ?? generatedId
  const innerRef = React.useRef<HTMLInputElement>(null)

  React.useImperativeHandle(forwardedRef, () => innerRef.current as HTMLInputElement)

  React.useEffect(() => {
    if (innerRef.current) innerRef.current.indeterminate = indeterminate
  }, [indeterminate])

  return (
    <div className={cn('flex items-start gap-3', className)}>
      <span className="relative flex items-center">
        <input
          ref={innerRef}
          id={inputId}
          type="checkbox"
          disabled={disabled}
          className="peer size-5 shrink-0 cursor-pointer appearance-none rounded-[5px] border border-input bg-surface shadow-e1 transition-colors checked:border-primary checked:bg-primary indeterminate:border-primary indeterminate:bg-primary disabled:cursor-not-allowed disabled:opacity-55"
          {...props}
        />
        <span
          className="pointer-events-none absolute inset-0 flex items-center justify-center text-primary-foreground opacity-0 peer-checked:opacity-100 peer-indeterminate:opacity-100"
          aria-hidden="true"
        >
          {indeterminate ? <Minus className="size-3.5" strokeWidth={3} /> : <Check className="size-3.5" strokeWidth={3} />}
        </span>
      </span>

      {(label || description) && (
        <label
          htmlFor={inputId}
          className={cn(
            // -my-2/py-2 gives the row a 44px tap height without visually
            // adding space between stacked checkboxes.
            '-my-2 min-w-0 cursor-pointer select-none py-2 text-sm leading-snug',
            disabled && 'cursor-not-allowed opacity-60',
          )}
        >
          {label && <span className="font-medium text-foreground">{label}</span>}
          {description && <span className="mt-0.5 block text-muted-foreground">{description}</span>}
        </label>
      )}
    </div>
  )
})

export interface SwitchProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  label?: React.ReactNode
  description?: React.ReactNode
}

/** A switch means the change takes effect immediately. Use a checkbox otherwise. */
export const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(function Switch(
  { className, label, description, disabled, id, ...props },
  ref,
) {
  const generatedId = React.useId()
  const inputId = id ?? generatedId

  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      {(label || description) && (
        <label
          htmlFor={inputId}
          className={cn(
            'min-w-0 flex-1 cursor-pointer select-none text-sm leading-snug',
            disabled && 'cursor-not-allowed opacity-60',
          )}
        >
          {label && <span className="font-medium text-foreground">{label}</span>}
          {description && <span className="mt-0.5 block text-muted-foreground">{description}</span>}
        </label>
      )}

      <span className="relative inline-flex shrink-0 items-center">
        <input
          ref={ref}
          id={inputId}
          type="checkbox"
          role="switch"
          disabled={disabled}
          className="peer h-6 w-11 cursor-pointer appearance-none rounded-full border border-input bg-muted transition-colors checked:border-primary checked:bg-primary disabled:cursor-not-allowed disabled:opacity-55"
          {...props}
        />
        <span
          className="pointer-events-none absolute left-0.5 size-5 rounded-full bg-surface shadow-e2 transition-transform duration-200 peer-checked:translate-x-5"
          aria-hidden="true"
        />
      </span>
    </div>
  )
})
