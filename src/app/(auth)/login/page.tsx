'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  AuthHeading,
  FormError,
  GoogleButton,
  OrDivider,
  PasswordInput,
  SubmitButton,
} from '@/components/auth/auth-form'
import { Input } from '@/components/ui/input'

/**
 * Sign in.
 *
 * The error copy is deliberately vague — "that email or password is not
 * correct" rather than naming which one. Distinguishing them turns this form
 * into a tool for discovering which addresses have accounts.
 */
export default function LoginPage() {
  return (
    <React.Suspense fallback={<LoginSkeleton />}>
      <LoginForm />
    </React.Suspense>
  )
}

function LoginSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-8 w-40 rounded bg-muted" />
      <div className="h-11 w-full rounded-lg bg-muted" />
      <div className="h-11 w-full rounded-lg bg-muted" />
      <div className="h-12 w-full rounded-lg bg-muted" />
    </div>
  )
}

const OAUTH_ERRORS: Record<string, string> = {
  google_not_configured:
    'Google sign-in is not set up on this deployment yet. Use your email and password.',
  google_failed: 'Google sign-in did not complete. Please try again.',
  not_configured:
    'Authentication is not configured on this deployment (JWT_SECRET is missing). Contact your administrator.',
  session_expired: 'Your session has expired. Please sign in again.',
}

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirectTo')

  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [error, setError] = React.useState<string | null>(
    OAUTH_ERRORS[searchParams.get('error') ?? ''] ?? null,
  )
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({})
  const [submitting, setSubmitting] = React.useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    setFieldErrors({})

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await response.json()

      if (!response.ok) {
        if (data.field) setFieldErrors({ [data.field]: data.error })
        else setError(data.error ?? 'Could not sign you in.')
        return
      }

      // They hold the password but have not verified the address yet — send
      // them to finish that rather than to a dashboard they cannot use.
      if (data.needsVerification) {
        router.push(`/verify?email=${encodeURIComponent(data.email)}`)
        return
      }

      router.push(redirectTo || data.landingPath || '/dashboard')
      // Server components cache the signed-out state; without this the shell
      // renders as anonymous until the next hard navigation.
      router.refresh()
    } catch {
      setError('Could not reach the server. Check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <AuthHeading
        title="Sign in"
        description="Access the CreditSense lending dashboard."
      />

      <FormError message={error} />

      <GoogleButton redirectTo={redirectTo ?? undefined} disabled={submitting} />

      <OrDivider label="or sign in with email" />

      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
          disabled={submitting}
          error={fieldErrors.email}
          placeholder="you@lender.pk"
        />

        <div>
          <PasswordInput
            label="Password"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
            required
            disabled={submitting}
            error={fieldErrors.password}
          />
          <div className="mt-2 text-right">
            <Link
              href="/forgot-password"
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Forgot your password?
            </Link>
          </div>
        </div>

        <SubmitButton loading={submitting} disabled={!email || !password}>
          Sign in
        </SubmitButton>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Do not have an account?{' '}
        <Link
          href="/signup"
          className="font-semibold text-primary underline-offset-4 hover:underline"
        >
          Create one
        </Link>
      </p>
    </>
  )
}
