'use client'

import * as React from 'react'
import { cn } from '@/lib/utils/cn'
import {
  FieldShell,
  controlBase,
  controlSize,
  controlState,
  useFieldIds,
  type FieldOwnProps,
} from './field'

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'>,
    FieldOwnProps {
  /** Rendered inside the control on the left — a search or currency glyph. */
  leadingIcon?: React.ReactNode
  /** Rendered inside the control on the right — a clear button or unit label. */
  trailingIcon?: React.ReactNode
  /** Fixed text prefix inside the control, e.g. `Rs`. */
  prefix?: string
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    className,
    containerClassName,
    label,
    hint,
    error,
    required,
    labelHidden,
    leadingIcon,
    trailingIcon,
    prefix,
    id,
    type = 'text',
    ...props
  },
  ref,
) {
  const { controlId, describedBy, invalid } = useFieldIds(id, hint, error)
  const hasLeft = Boolean(leadingIcon || prefix)

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
        {leadingIcon && (
          <span
            className="pointer-events-none absolute left-3 flex items-center text-muted-foreground [&_svg]:size-4"
            aria-hidden="true"
          >
            {leadingIcon}
          </span>
        )}
        {prefix && !leadingIcon && (
          <span
            className="pointer-events-none absolute left-3 text-sm font-medium text-muted-foreground"
            aria-hidden="true"
          >
            {prefix}
          </span>
        )}

        <input
          ref={ref}
          id={controlId}
          type={type}
          required={required}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          className={cn(
            controlBase,
            controlSize,
            controlState(invalid),
            hasLeft && (prefix ? 'pl-10' : 'pl-9'),
            trailingIcon && 'pr-10',
            className,
          )}
          {...props}
        />

        {trailingIcon && (
          <span className="absolute right-3 flex items-center text-muted-foreground [&_svg]:size-4">
            {trailingIcon}
          </span>
        )}
      </div>
    </FieldShell>
  )
})

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement>,
    FieldOwnProps {}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, containerClassName, label, hint, error, required, labelHidden, id, rows = 4, ...props },
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
      <textarea
        ref={ref}
        id={controlId}
        rows={rows}
        required={required}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className={cn(
          controlBase,
          'min-h-24 resize-y px-3 py-2.5 text-base leading-relaxed sm:text-sm',
          controlState(invalid),
          className,
        )}
        {...props}
      />
    </FieldShell>
  )
})
