'use client'

import * as React from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/**
 * Shared pieces for the auth screens.
 */

export function AuthHeading({
  title,
  description,
}: {
  title: string
  description?: React.ReactNode
}) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {description && (
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
      )}
    </div>
  )
}

/** A form-level error. `role="alert"` so it is announced when it appears. */
export function FormError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <Alert tone="danger" className="mb-4">
      {message}
    </Alert>
  )
}

/**
 * A password field with a show/hide toggle.
 *
 * The toggle is not a nicety on mobile: typing a 14-character passphrase on a
 * phone keyboard blind is how people end up choosing short, weak passwords.
 */
export function PasswordInput({
  label,
  value,
  onChange,
  error,
  hint,
  autoComplete = 'current-password',
  required,
  disabled,
  id,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
  hint?: string
  autoComplete?: string
  required?: boolean
  disabled?: boolean
  id?: string
}) {
  const [visible, setVisible] = React.useState(false)

  return (
    <Input
      id={id}
      label={label}
      type={visible ? 'text' : 'password'}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      autoComplete={autoComplete}
      required={required}
      disabled={disabled}
      error={error}
      hint={hint}
      trailingIcon={
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          // A 44px tap target achieved with negative margins, so it does not
          // visually inflate the field.
          className="-m-3 p-3 text-muted-foreground transition-colors hover:text-foreground"
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          tabIndex={-1}
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      }
    />
  )
}

/**
 * The password strength meter.
 *
 * Four segments plus a word. The word carries the meaning — a row of coloured
 * bars alone means nothing to someone who cannot distinguish the colours.
 */
export function PasswordStrength({
  score,
  problems,
}: {
  score: number
  problems: string[]
}) {
  const labels = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong']
  const colours = [
    'bg-danger',
    'bg-danger',
    'bg-warning',
    'bg-risk-low',
    'bg-success',
  ]

  return (
    <div className="mt-2">
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={cn(
                'h-1 flex-1 rounded-full transition-colors duration-200',
                i < score ? colours[score] : 'bg-muted',
              )}
            />
          ))}
        </div>
        <span
          className={cn(
            'w-16 shrink-0 text-right text-xs font-medium',
            score >= 3 ? 'text-success' : score >= 2 ? 'text-warning' : 'text-muted-foreground',
          )}
        >
          {labels[score]}
        </span>
      </div>

      {problems.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {problems.map((problem) => (
            <li key={problem} className="text-xs text-muted-foreground">
              · {problem}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * "Continue with Google".
 *
 * A plain link, not a fetch: the OAuth flow is a full-page navigation to
 * Google and back. Rendering it as a button that calls JavaScript would break
 * middle-click, "open in new tab", and the browser's own back behaviour.
 */
export function GoogleButton({
  redirectTo,
  disabled,
  label = 'Continue with Google',
}: {
  redirectTo?: string
  disabled?: boolean
  label?: string
}) {
  const href = redirectTo
    ? `/api/auth/google?redirectTo=${encodeURIComponent(redirectTo)}`
    : '/api/auth/google'

  return (
    <a
      href={disabled ? undefined : href}
      aria-disabled={disabled || undefined}
      className={cn(
        'flex min-h-11 w-full items-center justify-center gap-3 rounded-lg border border-border-strong bg-surface px-4 text-sm font-medium text-foreground shadow-e1 transition-colors',
        disabled
          ? 'pointer-events-none opacity-55'
          : 'hover:bg-accent active:bg-accent',
      )}
    >
      <GoogleLogo />
      {label}
    </a>
  )
}

/** Google's mark, inline. Their brand guidelines require the exact colours. */
function GoogleLogo() {
  return (
    <svg className="size-[18px] shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.76c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1a11 11 0 0 0-9.82 6.05l3.66 2.84c.87-2.6 3.3-4.51 6.16-4.51Z"
      />
    </svg>
  )
}

/** "or" separator between the Google button and the email form. */
export function OrDivider({ label = 'or' }: { label?: string }) {
  return (
    <div className="relative my-5 flex items-center" role="separator">
      <div className="flex-1 border-t border-border" />
      <span className="px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <div className="flex-1 border-t border-border" />
    </div>
  )
}

export function SubmitButton({
  children,
  loading,
  disabled,
}: {
  children: React.ReactNode
  loading?: boolean
  disabled?: boolean
}) {
  return (
    <Button type="submit" size="lg" fullWidth loading={loading} disabled={disabled}>
      {children}
    </Button>
  )
}

/**
 * The resend-code control with its cooldown.
 *
 * The countdown is shown rather than the button simply being disabled, so the
 * user knows it is coming back and does not sit refreshing the page.
 */
export function ResendTimer({
  seconds,
  onResend,
  sending,
}: {
  seconds: number
  onResend: () => void
  sending: boolean
}) {
  if (seconds > 0) {
    return (
      <p className="text-sm text-muted-foreground" aria-live="polite">
        You can request another code in{' '}
        <span className="font-medium tabular-nums text-foreground">{seconds}s</span>
      </p>
    )
  }

  return (
    <button
      type="button"
      onClick={onResend}
      disabled={sending}
      className="text-sm font-semibold text-primary underline-offset-4 hover:underline disabled:opacity-60"
    >
      {sending ? 'Sending…' : 'Send a new code'}
    </button>
  )
}

/** Countdown that ticks down to zero and stops. */
export function useCountdown(initial: number): [number, (value: number) => void] {
  const [seconds, setSeconds] = React.useState(initial)

  React.useEffect(() => {
    if (seconds <= 0) return
    const id = window.setTimeout(() => setSeconds((s) => s - 1), 1000)
    return () => window.clearTimeout(id)
  }, [seconds])

  return [seconds, setSeconds]
}
