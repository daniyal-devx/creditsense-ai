'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  AuthHeading,
  FormError,
  GoogleButton,
  OrDivider,
  PasswordInput,
  PasswordStrength,
  SubmitButton,
} from '@/components/auth/auth-form'
import { Input } from '@/components/ui/input'
import { checkPasswordStrength } from '@/lib/auth/password-rules'

/**
 * Create an account.
 *
 * The strength check runs on every keystroke here and again on the server at
 * submit. The client copy is for feedback, never for enforcement — anyone can
 * post straight to the API, so the server rule is the real one. They share the
 * same implementation so the two cannot disagree and reject a password the
 * form said was fine.
 */
export default function SignupPage() {
  const router = useRouter()

  const [fullName, setFullName] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({})
  const [submitting, setSubmitting] = React.useState(false)
  const [touchedPassword, setTouchedPassword] = React.useState(false)

  const strength = React.useMemo(
    () => checkPasswordStrength(password, { email, name: fullName }),
    [password, email, fullName],
  )

  const canSubmit = fullName.trim().length >= 2 && email.includes('@') && strength.valid

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    setFieldErrors({})

    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName, email, password }),
      })
      const data = await response.json()

      if (!response.ok) {
        if (data.field) setFieldErrors({ [data.field]: data.error })
        else setError(data.error ?? 'Could not create your account.')
        return
      }

      router.push(`/verify?email=${encodeURIComponent(email)}`)
    } catch {
      setError('Could not reach the server. Check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <AuthHeading
        title="Create your account"
        description="For lender staff. Applicants never sign in here — they interact through the lender's own app."
      />

      <FormError message={error} />

      <GoogleButton disabled={submitting} label="Sign up with Google" />

      <OrDivider label="or use your email" />

      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <Input
          label="Full name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          autoComplete="name"
          required
          disabled={submitting}
          error={fieldErrors.fullName}
          placeholder="Ayesha Khan"
        />

        <Input
          label="Work email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
          disabled={submitting}
          error={fieldErrors.email}
          placeholder="you@lender.pk"
          hint="We will send a 6-digit code to confirm it."
        />

        <div>
          <div onBlur={() => setTouchedPassword(true)}>
            <PasswordInput
              label="Password"
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
              required
              disabled={submitting}
              error={fieldErrors.password}
            />
          </div>
          {(password.length > 0 || touchedPassword) && (
            <PasswordStrength
              score={strength.score}
              // Only nag once they have stopped typing, or the list flickers
              // through every intermediate state as they type.
              problems={touchedPassword || password.length >= 8 ? strength.problems : []}
            />
          )}
        </div>

        <SubmitButton loading={submitting} disabled={!canSubmit}>
          Create account
        </SubmitButton>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link
          href="/login"
          className="font-semibold text-primary underline-offset-4 hover:underline"
        >
          Sign in
        </Link>
      </p>
    </>
  )
}
