'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { MailCheck } from 'lucide-react'
import {
  AuthHeading,
  FormError,
  ResendTimer,
  SubmitButton,
  useCountdown,
} from '@/components/auth/auth-form'
import { CodeInput } from '@/components/auth/code-input'
import { Alert } from '@/components/ui/alert'

/**
 * Enter the emailed code.
 *
 * The code submits itself the moment the sixth digit lands — asking someone to
 * type six digits and then reach for a button is one interaction too many,
 * especially one-handed on a phone.
 */
export function VerifyForm({ emailConfigured }: { emailConfigured: boolean }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const email = searchParams.get('email') ?? ''

  const [code, setCode] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)
  const [resending, setResending] = React.useState(false)
  const [notice, setNotice] = React.useState<string | null>(null)
  const [cooldown, setCooldown] = useCountdown(0)

  // Guards against the auto-submit firing twice for the same code — the
  // onComplete callback and a manual submit can otherwise race.
  const submittedFor = React.useRef<string | null>(null)

  const verify = React.useCallback(
    async (value: string) => {
      if (submittedFor.current === value) return
      submittedFor.current = value

      setSubmitting(true)
      setError(null)

      try {
        const response = await fetch('/api/auth/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, code: value }),
        })
        const data = await response.json()

        if (!response.ok) {
          setError(data.error ?? 'That code is not correct.')
          setCode('')
          // Let them try the same digits again after a genuine failure.
          submittedFor.current = null
          return
        }

        router.push(data.landingPath ?? '/dashboard')
        router.refresh()
      } catch {
        setError('Could not reach the server. Check your connection and try again.')
        submittedFor.current = null
      } finally {
        setSubmitting(false)
      }
    },
    [email, router, setCode],
  )

  const resend = async () => {
    setResending(true)
    setError(null)
    setNotice(null)

    try {
      const response = await fetch('/api/auth/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await response.json()

      if (!response.ok) {
        setError(data.error ?? 'Could not send a new code.')
        if (data.retryAfterSeconds) setCooldown(data.retryAfterSeconds)
        return
      }

      setNotice('A new code is on its way. The previous one no longer works.')
      setCooldown(data.cooldownSeconds ?? 60)
      setCode('')
      submittedFor.current = null
    } catch {
      setError('Could not reach the server. Check your connection and try again.')
    } finally {
      setResending(false)
    }
  }

  if (!email) {
    return (
      <>
        <AuthHeading title="Check your email" />
        <Alert tone="warning" title="We do not know which address to verify">
          Open the link from your email, or{' '}
          <Link href="/signup" className="font-semibold underline underline-offset-4">
            start signing up again
          </Link>
          .
        </Alert>
      </>
    )
  }

  return (
    <>
      <div className="mb-6 flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary-soft-foreground">
        <MailCheck className="size-6" aria-hidden="true" />
      </div>

      <AuthHeading
        title="Check your email"
        description={
          <>
            We sent a 6-digit code to{' '}
            <strong className="font-medium text-foreground">{email}</strong>. It expires in 10
            minutes.
          </>
        }
      />

      <FormError message={error} />

      {/*
        Without SMTP credentials the code is generated and stored but never
        delivered. Telling someone to "check your email" for a message that
        will never arrive is worse than saying nothing — so say what actually
        happened and where to find the code.
      */}
      {!emailConfigured && (
        <Alert tone="warning" title="Email delivery is not configured" className="mb-4">
          No code was sent, because this deployment has no{' '}
          <code className="font-mono text-xs">GMAIL_APP_PASSWORD</code>. In development the code is
          printed to the server console — check the terminal running{' '}
          <code className="font-mono text-xs">npm run dev</code>.
        </Alert>
      )}

      {notice && (
        <Alert tone="success" className="mb-4">
          {notice}
        </Alert>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (code.length === 6) void verify(code)
        }}
        className="flex flex-col gap-5"
      >
        <CodeInput
          value={code}
          onChange={(value) => {
            setCode(value)
            if (error) setError(null)
          }}
          onComplete={(value) => void verify(value)}
          disabled={submitting}
          error={Boolean(error)}
          autoFocus
          label="6-digit verification code"
        />

        <SubmitButton loading={submitting} disabled={code.length !== 6}>
          Verify and continue
        </SubmitButton>
      </form>

      <div className="mt-6 flex flex-col items-center gap-3 text-center">
        <ResendTimer seconds={cooldown} onResend={resend} sending={resending} />
        <p className="text-sm text-muted-foreground">
          Wrong address?{' '}
          <Link
            href="/signup"
            className="font-semibold text-primary underline-offset-4 hover:underline"
          >
            Sign up again
          </Link>
        </p>
      </div>

      <p className="mt-8 text-center text-xs leading-relaxed text-muted-foreground">
        Not in your inbox? Check spam — mail sent over Gmail SMTP often lands there in development.
      </p>
    </>
  )
}
