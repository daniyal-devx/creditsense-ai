'use client'

import * as React from 'react'
import { PasswordInput, PasswordStrength } from '@/components/auth/auth-form'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { checkPasswordStrength } from '@/lib/auth/password-rules'

/**
 * Change password from the settings page.
 *
 * The server re-issues a session for this device after the change, so the user
 * stays signed in here while every other device is signed out. Being logged
 * out of the tab you just used to secure your account is a confusing reward
 * for doing the right thing.
 */
export function ChangePasswordForm() {
  const toast = useToast()

  const [currentPassword, setCurrentPassword] = React.useState('')
  const [newPassword, setNewPassword] = React.useState('')
  const [confirmPassword, setConfirmPassword] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({})
  const [submitting, setSubmitting] = React.useState(false)

  const strength = React.useMemo(() => checkPasswordStrength(newPassword), [newPassword])
  const mismatch = confirmPassword.length > 0 && confirmPassword !== newPassword
  const canSubmit = strength.valid && !mismatch && confirmPassword.length > 0

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    setFieldErrors({})

    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      const data = await response.json()

      if (!response.ok) {
        if (data.field) setFieldErrors({ [data.field]: data.error })
        else setError(data.error ?? 'Could not change your password.')
        return
      }

      toast.success('Password updated', 'Every other device has been signed out.')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch {
      setError('Could not reach the server. Check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex max-w-md flex-col gap-4">
      {error && <Alert tone="danger">{error}</Alert>}

      <PasswordInput
        label="Current password"
        value={currentPassword}
        onChange={setCurrentPassword}
        autoComplete="current-password"
        disabled={submitting}
        error={fieldErrors.currentPassword}
        hint="Leave blank if you signed up with Google and have never set one."
      />

      <div>
        <PasswordInput
          label="New password"
          value={newPassword}
          onChange={setNewPassword}
          autoComplete="new-password"
          required
          disabled={submitting}
          error={fieldErrors.newPassword}
        />
        {newPassword.length > 0 && (
          <PasswordStrength score={strength.score} problems={strength.problems} />
        )}
      </div>

      <PasswordInput
        label="Confirm new password"
        value={confirmPassword}
        onChange={setConfirmPassword}
        autoComplete="new-password"
        required
        disabled={submitting}
        error={mismatch ? 'The two passwords do not match.' : undefined}
      />

      <Button type="submit" loading={submitting} disabled={!canSubmit} className="sm:w-auto">
        Update password
      </Button>
    </form>
  )
}
