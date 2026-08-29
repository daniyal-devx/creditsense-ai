'use client'

import * as React from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import {
  FieldShell,
  controlBase,
  controlSize,
  controlState,
  useFieldIds,
  type FieldOwnProps,
} from './field'

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

export interface SelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size' | 'children'>,
    FieldOwnProps {
  options: readonly SelectOption[]
  /** Shown as a disabled first option when the value is empty. */
  placeholder?: string
}

/**
 * A native `<select>`, deliberately.
 *
 * A custom listbox would let us style the dropdown, but the native control
 * gives us the OS picker on mobile — a full-height, thumb-friendly wheel on
 * iOS and a proper dialog on Android — plus keyboard and screen-reader
 * behaviour we would otherwise have to rebuild and would get subtly wrong.
 * For a tool a loan officer uses one-handed in the field, that trade is worth
 * far more than a styled dropdown.
 */
export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(function Select(
  {
    className,
    containerClassName,
    label,
    hint,
    error,
    required,
    labelHidden,
    options,
    placeholder,
    id,
    value,
    defaultValue,
    ...props
  },
  ref,
) {
  const { controlId, describedBy, invalid } = useFieldIds(id, hint, error)

  return (
    <FieldShell
      label={label}
      hint={hint}
      error={error}
      required={required}
      labelHidden={labelHidden}
      containerClassName={containerClassName}
      controlId={controlId}
    >
      <div className="relative flex w-full items-center">
        <select
          ref={ref}
          id={controlId}
          required={required}
          value={value}
          defaultValue={defaultValue ?? (placeholder ? '' : undefined)}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          className={cn(
            controlBase,
            controlSize,
            controlState(invalid),
            'cursor-pointer appearance-none pr-10',
            className,
          )}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} disabled={opt.disabled}>
              {opt.label}
            </option>
          ))}
        </select>

        <ChevronDown
          className="pointer-events-none absolute right-3 size-4 text-muted-foreground"
          aria-hidden="true"
        />
      </div>
    </FieldShell>
  )
})
