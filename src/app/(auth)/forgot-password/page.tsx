'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { KeyRound } from 'lucide-react'
import { AuthHeading, FormError, SubmitButton } from '@/components/auth/auth-form'
import { Input } from '@/components/ui/input'

/**
 * Request a password reset code.
 *
 * The confirmation is deliberately unconditional — "if that address has an
 * account, a code is on its way". Saying "no account found" would let anyone
 * enumerate which staff have accounts, one address at a time.
 */
export default function ForgotPasswordPage() {
  const router = useRouter()

  const [email, setEmail] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setError(null)

    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await response.json()

      if (!response.ok) {
        setError(data.error ?? 'Could not send a reset code.')
        return
      }

      router.push(`/reset-password?email=${encodeURIComponent(email)}`)
    } catch {
      setError('Could not reach the server. Check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <div className="mb-6 flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary-soft-foreground">
        <KeyRound className="size-6" aria-hidden="true" />
      </div>

      <AuthHeading
        title="Reset your password"
        description="Enter your email and we will send a 6-digit code to set a new one."
      />

      <FormError message={error} />

      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
          disabled={submitting}
          placeholder="you@lender.pk"
        />

        <SubmitButton loading={submitting} disabled={!email.includes('@')}>
          Send reset code
        </SubmitButton>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Remembered it?{' '}
        <Link
          href="/login"
          className="font-semibold text-primary underline-offset-4 hover:underline"
        >
          Back to sign in
        </Link>
      </p>
    </>
  )
}
