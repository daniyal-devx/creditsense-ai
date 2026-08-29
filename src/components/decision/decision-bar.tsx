'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { AlertOctagon, Ban, CheckCircle2, Send } from 'lucide-react'
import { StickyActionBar } from '@/components/layout/page-header'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { useToast } from '@/components/ui/toast'
import { formatPKR } from '@/lib/utils/format'

/**
 * The approve / reject / send-to-review action bar.
 *
 * On mobile it pins above the bottom nav so it is always in thumb reach — a
 * loan officer standing in a shop should never have to scroll back up to act.
 * On desktop it sits inline at the end of the page.
 *
 * Reasoning is mandatory on every path, including approval. A decision without
 * a recorded reason cannot be defended months later, and "approved" with no
 * note is the one that turns out to matter.
 */

export interface DecisionBarProps {
  applicationId: string
  applicantName: string
  requestedAmount: number
  requestedTenorMonths: number
  /** What the affordability engine recommends, pre-filled into the approval. */
  recommendedAmount: number | null
  recommendedTenorMonths: number | null
  /** Blocks approval entirely. */
  fraudBlocked: boolean
  /** Evidence captured alongside the decision. */
  evidence: {
    score: number | null
    band: string | null
    fraudLevel: string | null
    recommendedAmount: number | null
  }
}

type PendingAction = 'approve' | 'reject' | 'send_to_review' | null

export function DecisionBar({
  applicationId,
  applicantName,
  requestedAmount,
  requestedTenorMonths,
  recommendedAmount,
  recommendedTenorMonths,
  fraudBlocked,
  evidence,
}: DecisionBarProps) {
  const router = useRouter()
  const toast = useToast()

  const [action, setAction] = React.useState<PendingAction>(null)
  const [reasoning, setReasoning] = React.useState('')
  const [amount, setAmount] = React.useState(String(recommendedAmount ?? requestedAmount))
  const [tenor, setTenor] = React.useState(
    String(recommendedTenorMonths ?? requestedTenorMonths),
  )
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const firstName = applicantName.split(' ')[0]
  const close = () => {
    if (submitting) return
    setAction(null)
    setError(null)
  }

  const submit = async () => {
    if (!action) return
    setSubmitting(true)
    setError(null)

    try {
      const response = await fetch(`/api/applications/${applicationId}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          reasoning,
          ...(action === 'approve'
            ? {
                approvedAmount: Number(amount),
                approvedTenorMonths: Number(tenor),
              }
            : {}),
          evidence,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error ?? 'Could not record the decision.')
        return
      }

      const message =
        action === 'approve'
          ? `Approved ${formatPKR(Number(amount))} for ${firstName}`
          : action === 'reject'
            ? `Rejected ${firstName}'s application`
            : `Sent ${firstName}'s application to manual review`

      toast.success(message, data.loanReference ? `Loan ${data.loanReference} created.` : undefined)
      setAction(null)
      setReasoning('')
      router.refresh()
    } catch {
      setError('Could not reach the server. Check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const config = {
    approve: {
      title: `Approve ${applicantName}?`,
      description: 'This creates the loan and its instalment schedule immediately.',
      confirmLabel: 'Approve and disburse',
      variant: 'success' as const,
      reasoningLabel: 'Why are you approving this?',
      reasoningHint: 'Recorded in the audit trail alongside the score and fraud level you saw.',
    },
    reject: {
      title: `Reject ${applicantName}?`,
      description:
        'The applicant will be told they were not approved. Your reasoning becomes the adverse-action record.',
      confirmLabel: 'Reject application',
      variant: 'danger' as const,
      reasoningLabel: 'Why are you rejecting this?',
      reasoningHint:
        'Be specific and factual — this is what the applicant is entitled to be told.',
    },
    send_to_review: {
      title: `Send ${applicantName} to manual review?`,
      description: 'The application moves out of your queue into the senior review list.',
      confirmLabel: 'Send to review',
      variant: 'primary' as const,
      reasoningLabel: 'What needs a second opinion?',
      reasoningHint: 'Say what you are unsure about, so the reviewer knows where to look.',
    },
  }[action ?? 'approve']

  return (
    <>
      <StickyActionBar>
        <Button
          variant="secondary"
          onClick={() => setAction('send_to_review')}
          leadingIcon={<Send className="size-4" />}
        >
          <span className="sm:hidden">Review</span>
          <span className="hidden sm:inline">Send to review</span>
        </Button>
        <Button
          variant="danger"
          onClick={() => setAction('reject')}
          leadingIcon={<Ban className="size-4" />}
        >
          Reject
        </Button>
        <Button
          variant="success"
          onClick={() => setAction('approve')}
          disabled={fraudBlocked}
          leadingIcon={<CheckCircle2 className="size-4" />}
          title={fraudBlocked ? 'Held by FraudSense — a Fraud Analyst must clear it first' : undefined}
        >
          Approve
        </Button>
      </StickyActionBar>

      {fraudBlocked && (
        <Alert tone="danger" icon={<AlertOctagon />} className="mt-4" title="Approval is blocked">
          FraudSense has flagged this application for mandatory review. It can still be rejected or
          sent to review, but not approved until a Fraud Analyst clears it.
        </Alert>
      )}

      <Modal
        open={action !== null}
        onClose={close}
        title={config.title}
        description={config.description}
        size="lg"
        dismissible={!submitting}
        footer={
          <>
            <Button variant="secondary" onClick={close} disabled={submitting} fullWidth className="sm:w-auto">
              Cancel
            </Button>
            <Button
              variant={config.variant}
              onClick={submit}
              loading={submitting}
              disabled={reasoning.trim().length < 10}
              fullWidth
              className="sm:w-auto"
            >
              {config.confirmLabel}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {error && <Alert tone="danger">{error}</Alert>}

          {action === 'approve' && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Amount to approve"
                  type="number"
                  prefix="Rs"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  hint={
                    recommendedAmount !== null && Number(amount) > recommendedAmount
                      ? `Above the safe ceiling of ${formatPKR(recommendedAmount)}`
                      : `Requested ${formatPKR(requestedAmount)}`
                  }
                  error={
                    Number(amount) <= 0 ? 'Enter an amount greater than zero.' : undefined
                  }
                />
                <Input
                  label="Term in months"
                  type="number"
                  value={tenor}
                  onChange={(e) => setTenor(e.target.value)}
                  hint={`Requested ${requestedTenorMonths} months`}
                />
              </div>

              {recommendedAmount !== null && Number(amount) > recommendedAmount && (
                <Alert tone="warning" title="Above the recommended amount">
                  The affordability engine caps this at {formatPKR(recommendedAmount)}. Approving
                  more means the instalment exceeds what {firstName}&apos;s income can carry in a
                  quiet month — say why in your reasoning below.
                </Alert>
              )}
            </>
          )}

          <Textarea
            label={config.reasoningLabel}
            value={reasoning}
            onChange={(e) => setReasoning(e.target.value)}
            rows={4}
            required
            hint={config.reasoningHint}
            error={
              reasoning.length > 0 && reasoning.trim().length < 10
                ? 'A little more detail — at least a sentence.'
                : undefined
            }
            placeholder={
              action === 'approve'
                ? 'e.g. Strong bill payment record over 24 months and stable income. Instalment sits well inside affordability.'
                : action === 'reject'
                  ? 'e.g. Income fell 45% over the last quarter and two bills went unpaid. No capacity for an instalment at present.'
                  : 'e.g. Score is strong but the fraud graph shows a shared device. Want a second opinion before approving.'
            }
          />
        </div>
      </Modal>
    </>
  )
}

/** Shown in place of the action bar for roles that can read but not decide. */
export function ReadOnlyDecisionNotice({ roleLabel }: { roleLabel: string }) {
  return (
    <Alert tone="info" className="mt-6" title="Read-only">
      The {roleLabel} role can see this full assessment but cannot approve or reject. Deciding is
      limited to the Loan Officer and Administrator roles.
    </Alert>
  )
}
