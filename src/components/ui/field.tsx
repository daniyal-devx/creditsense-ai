'use client'

import * as React from 'react'
import { AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

/**
 * The shared skeleton behind every form control.
 *
 * It exists so that a label, a hint and an error message are wired to their
 * input the same way every single time: the label is a real `<label for>`, the
 * hint and error are linked through `aria-describedby`, and an invalid field
 * carries `aria-invalid`. Getting this wrong is the most common accessibility
 * failure in a form, so no control is allowed to hand-roll it.
 */

export interface FieldOwnProps {
  label?: React.ReactNode
  /** Helper text shown under the control when there is no error. */
  hint?: React.ReactNode
  /** When set, the control renders in its error state and this replaces the hint. */
  error?: React.ReactNode
  required?: boolean
  /** Hides the label visually but keeps it for screen readers. */
  labelHidden?: boolean
  /** Wrapper class. Use for grid spans, not for styling the control itself. */
  containerClassName?: string
}

export interface FieldIds {
  controlId: string
  describedBy: string | undefined
  invalid: boolean
}

/** Builds the ids and ARIA wiring a control needs. */
export function useFieldIds(
  providedId: string | undefined,
  hint: React.ReactNode,
  error: React.ReactNode,
): FieldIds {
  const generated = React.useId()
  const controlId = providedId ?? generated
  const hintId = hint ? `${controlId}-hint` : undefined
  const errorId = error ? `${controlId}-error` : undefined
  // When there is an error the hint is replaced, so only one is ever described.
  const describedBy = errorId ?? hintId
  return { controlId, describedBy, invalid: Boolean(error) }
}

export function FieldShell({
  label,
  hint,
  error,
  required,
  labelHidden,
  containerClassName,
  controlId,
  children,
}: FieldOwnProps & { controlId: string; children: React.ReactNode }) {
  return (
    <div className={cn('flex w-full min-w-0 flex-col gap-1.5', containerClassName)}>
      {label && (
        <label
          htmlFor={controlId}
          className={cn(
            'text-sm font-medium leading-none text-foreground',
            labelHidden && 'sr-only',
          )}
        >
          {label}
          {required && (
            <>
              <span aria-hidden="true" className="ml-0.5 text-danger">
                *
              </span>
              <span className="sr-only"> (required)</span>
            </>
          )}
        </label>
      )}

      {children}

      {error ? (
        <p
          id={`${controlId}-error`}
          role="alert"
          className="flex items-start gap-1.5 text-sm leading-snug text-danger"
        >
          <AlertCircle className="mt-px size-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : hint ? (
        <p id={`${controlId}-hint`} className="text-sm leading-snug text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

/**
 * Shared control chrome. Height is 44px on mobile for a comfortable tap target
 * and drops to 40px from `sm:` up, where a pointer is doing the work.
 */
export const controlBase =
  'flex w-full min-w-0 rounded-lg border bg-surface text-foreground shadow-e1 ' +
  'transition-[border-color,box-shadow] duration-150 ' +
  'placeholder:text-muted-foreground ' +
  'disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60 ' +
  'read-only:bg-muted/50'

export const controlSize = 'h-11 px-3 py-2 text-base sm:h-10 sm:text-sm'

export function controlState(invalid: boolean) {
  return invalid
    ? 'border-danger focus-visible:outline-danger'
    : 'border-input hover:border-border-strong focus-visible:outline-ring'
}
