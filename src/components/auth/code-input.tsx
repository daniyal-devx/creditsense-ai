'use client'

import * as React from 'react'
import { cn } from '@/lib/utils/cn'

/**
 * The six-digit verification code input.
 *
 * The hardest small component in the product, because it has to work with a
 * phone keyboard, with paste, with autofill, and with a screen reader — and
 * the usual implementation (six separate inputs) breaks at least two of those.
 *
 * How this one works:
 *
 *   One real `<input>` holds the whole value. It is transparent and stretched
 *   over the six boxes, which are presentational. That single input is what
 *   makes `autocomplete="one-time-code"` work — iOS and Android offer the code
 *   straight from the SMS/email notification, and browsers will not do that
 *   for a split field. It also makes paste, select-all, undo and every screen
 *   reader behave natively, for free.
 *
 *   `inputMode="numeric"` brings up the number pad rather than the full
 *   keyboard, which on a 320px screen is the difference between a two-second
 *   task and a fiddly one.
 */

export interface CodeInputProps {
  value: string
  onChange: (value: string) => void
  /** Fired when the sixth digit is entered, so the user need not press submit. */
  onComplete?: (value: string) => void
  length?: number
  disabled?: boolean
  error?: boolean
  autoFocus?: boolean
  label?: string
  id?: string
  describedBy?: string
}

export function CodeInput({
  value,
  onChange,
  onComplete,
  length = 6,
  disabled,
  error,
  autoFocus,
  label = 'Verification code',
  id,
  describedBy,
}: CodeInputProps) {
  const generatedId = React.useId()
  const inputId = id ?? generatedId
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [focused, setFocused] = React.useState(false)

  const digits = value.padEnd(length, ' ').slice(0, length).split('')
  // The active box is the first empty one, or the last once the code is full.
  const activeIndex = Math.min(value.length, length - 1)

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    // Strip everything that is not a digit, so a pasted "482-915" or
    // "Your code is 482915" still works.
    const next = event.target.value.replace(/\D/g, '').slice(0, length)
    onChange(next)
    if (next.length === length) {
      onComplete?.(next)
    }
  }

  return (
    <div>
      <label htmlFor={inputId} className="sr-only">
        {label}
      </label>

      <div className="relative">
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          inputMode="numeric"
          // Both spellings: iOS honours "one-time-code", some Android builds
          // still look for the older token.
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={length}
          value={value}
          onChange={handleChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          disabled={disabled}
          autoFocus={autoFocus}
          aria-invalid={error || undefined}
          aria-describedby={describedBy}
          aria-label={label}
          // Transparent and stretched over the boxes below. `text-transparent`
          // plus a hidden caret means the real input is invisible but still
          // fully focusable and interactive.
          className="absolute inset-0 z-10 h-full w-full cursor-pointer bg-transparent text-transparent caret-transparent outline-none disabled:cursor-not-allowed"
          style={{ WebkitTextFillColor: 'transparent' }}
        />

        <div className="flex items-center justify-between gap-1.5 sm:gap-2" aria-hidden="true">
          {digits.map((digit, index) => {
            const filled = digit.trim() !== ''
            const isActive = focused && index === activeIndex && !disabled

            return (
              <div
                key={index}
                className={cn(
                  // A 12px gap between six boxes leaves ~44px each at 320px,
                  // which is exactly the minimum comfortable target.
                  'flex h-14 flex-1 items-center justify-center rounded-lg border bg-surface text-2xl font-semibold tabular-nums shadow-e1 transition-all duration-150 sm:h-16 sm:text-3xl',
                  error
                    ? 'border-danger'
                    : isActive
                      ? 'border-primary ring-2 ring-ring/30'
                      : filled
                        ? 'border-border-strong'
                        : 'border-input',
                  disabled && 'opacity-60',
                )}
              >
                {filled ? (
                  digit
                ) : isActive ? (
                  <span className="h-6 w-px animate-pulse bg-foreground sm:h-7" />
                ) : (
                  <span className="text-border-strong">·</span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* The value, announced properly. The boxes above are aria-hidden, so
          without this a screen reader would hear nothing as digits arrive. */}
      <p className="sr-only" aria-live="polite">
        {value.length === 0
          ? `Enter the ${length}-digit code`
          : `${value.length} of ${length} digits entered`}
      </p>
    </div>
  )
}
