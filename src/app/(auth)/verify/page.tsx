import { Suspense } from 'react'
import { isEmailConfigured } from '@/lib/email/send'
import { VerifyForm } from './verify-form'

export const dynamic = 'force-dynamic'

/**
 * A server shell around the verification form.
 *
 * It exists to read `isEmailConfigured()` — a server-only concern — and pass
 * the answer down, so the form can be honest when no code was actually sent
 * rather than telling the user to check an inbox nothing will arrive in.
 */
export default function VerifyPage() {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-muted" />}>
      <VerifyForm emailConfigured={isEmailConfigured()} />
    </Suspense>
  )
}
