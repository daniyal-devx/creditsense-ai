'use client'

import * as React from 'react'
import { LogoMark } from '@/components/layout/logo'
import { ErrorState } from '@/components/ui/states'

/**
 * The route-level error boundary.
 *
 * `reset()` re-renders the failed segment, which is what the "Try again"
 * button in ErrorState is wired to. The underlying message is only shown in
 * development — a lender should never see a stack trace, and a database error
 * string can leak schema details.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  React.useEffect(() => {
    console.error('[route error]', error)
  }, [error])

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4">
      <LogoMark className="size-10" />
      <ErrorState
        onRetry={reset}
        error={error}
        description={
          <>
            Something failed while loading this page. It is usually temporary.
            {error.digest && (
              <span className="mt-2 block text-xs text-muted-foreground">
                Reference: <span className="font-mono">{error.digest}</span>
              </span>
            )}
          </>
        }
      />
    </main>
  )
}
