'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ShieldCheck } from 'lucide-react'
import {
  AuthHeading,
  FormError,
  PasswordInput,
  PasswordStrength,
  SubmitButton,
} from '@/components/auth/auth-form'
import { CodeInput } from '@/components/auth/code-input'
import { Alert } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { checkPasswordStrength } from '@/lib/auth/password-rules'

export default function ResetPasswordPage() {
  return (
    <React.Suspense fallback={<div className="h-80 animate-pulse rounded-xl bg-muted" />}>
      <ResetPasswordForm />
    </React.Suspense>
  )
}

/**
 * Enter the reset code and set a new password.
 *
 * Both steps are on one screen rather than two. Splitting them means holding a
 * verified code in client state across a navigation, which is both more
 * fragile and easy to get wrong; and on a phone, one form the user completes
 * in a single pass beats two they can lose their place in.
 */
function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [email, setEmail] = React.useState(searchParams.get('email') ?? '')
  const [code, setCode] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({})
  const [submitting, setSubmitting] = React.useState(false)
  const [done, setDone] = React.useState(false)

  const strength = React.useMemo(
    () => checkPasswordStrength(password, { email }),
    [password, email],
  )

  const canSubmit = email.includes('@') && code.length === 6 && strength.valid

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    setFieldErrors({})

    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code, password }),
      })
      const data = await response.json()

      if (!response.ok) {
        if (data.field) setFieldErrors({ [data.field]: data.error })
        else setError(data.error ?? 'Could not reset your password.')
        if (data.field === 'code') setCode('')
        return
      }

      setDone(true)
      // A beat on the confirmation so the "signed out everywhere" message is
      // actually read before the redirect.
      setTimeout(() => router.push('/login'), 2200)
    } catch {
      setError('Could not reach the server. Check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <>
        <div className="mb-6 flex size-12 items-center justify-center rounded-full bg-success-soft text-success-soft-foreground">
          <ShieldCheck className="size-6" aria-hidden="true" />
        </div>
        <AuthHeading
          title="Password updated"
          description="You have been signed out on every other device. Taking you to sign in…"
        />
        <Link
          href="/login"
          className="text-sm font-semibold text-primary underline-offset-4 hover:underline"
        >
          Go to sign in now
        </Link>
      </>
    )
  }

  return (
    <>
      <AuthHeading
        title="Set a new password"
        description="Enter the code we emailed you, then choose a new password."
      />

      <FormError message={error} />

      <form onSubmit={submit} noValidate className="flex flex-col gap-5">
        {!searchParams.get('email') && (
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
            disabled={submitting}
          />
        )}

        <div>
          <p className="mb-2 text-sm font-medium">Verification code</p>
          <CodeInput
            value={code}
            onChange={(value) => {
              setCode(value)
              if (fieldErrors.code) setFieldErrors({})
            }}
            disabled={submitting}
            error={Boolean(fieldErrors.code)}
            autoFocus={Boolean(searchParams.get('email'))}
            label="6-digit reset code"
          />
          {fieldErrors.code && (
            <p role="alert" className="mt-2 text-sm text-danger">
              {fieldErrors.code}
            </p>
          )}
        </div>

        <div>
          <PasswordInput
            label="New password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            required
            disabled={submitting}
            error={fieldErrors.password}
          />
          {password.length > 0 && (
            <PasswordStrength score={strength.score} problems={strength.problems} />
          )}
        </div>

        <Alert tone="info">
          Setting a new password signs you out on every other device.
        </Alert>

        <SubmitButton loading={submitting} disabled={!canSubmit}>
          Update password
        </SubmitButton>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Did not get a code?{' '}
        <Link
          href="/forgot-password"
          className="font-semibold text-primary underline-offset-4 hover:underline"
        >
          Request another
        </Link>
      </p>
    </>
  )
}
