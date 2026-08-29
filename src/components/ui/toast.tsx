'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { useIsClient } from '@/lib/utils/use-is-client'

/**
 * Toasts confirm that an action landed.
 *
 * Placement is deliberate: bottom on mobile, where a thumb can dismiss without
 * stretching and where the toast does not cover the header; top-right on
 * desktop, out of the way of the content being worked on. On mobile the stack
 * sits above the bottom nav so it never hides navigation.
 */

export type ToastTone = 'success' | 'error' | 'warning' | 'info'

export interface Toast {
  id: string
  tone: ToastTone
  title: string
  description?: string
  /** ms before auto-dismiss. Errors default to staying until dismissed. */
  duration?: number
  action?: { label: string; onClick: () => void }
}

type ToastInput = Omit<Toast, 'id' | 'tone'> & { tone?: ToastTone }

interface ToastContextValue {
  toast: (input: ToastInput & { tone: ToastTone }) => string
  success: (title: string, description?: string) => string
  error: (title: string, description?: string) => string
  warning: (title: string, description?: string) => string
  info: (title: string, description?: string) => string
  dismiss: (id: string) => void
}

const ToastContext = React.createContext<ToastContextValue | null>(null)

const DEFAULT_DURATION: Record<ToastTone, number> = {
  success: 4000,
  info: 5000,
  warning: 7000,
  // An error must not disappear before the user has read why the thing failed.
  error: 0,
}

const ICONS: Record<ToastTone, React.ReactNode> = {
  success: <CheckCircle2 />,
  error: <XCircle />,
  warning: <AlertTriangle />,
  info: <Info />,
}

const TONE_CLASS: Record<ToastTone, string> = {
  success: 'text-success',
  error: 'text-danger',
  warning: 'text-warning',
  info: 'text-info',
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([])
  const isClient = useIsClient()
  const timers = React.useRef(new Map<string, number>())

  const dismiss = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      window.clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const toast = React.useCallback(
    (input: ToastInput & { tone: ToastTone }): string => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const duration = input.duration ?? DEFAULT_DURATION[input.tone]
      const next: Toast = { ...input, id, duration }

      // Cap the stack so a burst of failures cannot bury the screen.
      setToasts((prev) => [...prev.slice(-3), next])

      if (duration > 0) {
        timers.current.set(id, window.setTimeout(() => dismiss(id), duration))
      }
      return id
    },
    [dismiss],
  )

  React.useEffect(() => {
    const map = timers.current
    return () => {
      map.forEach((t) => window.clearTimeout(t))
      map.clear()
    }
  }, [])

  const value = React.useMemo<ToastContextValue>(
    () => ({
      toast,
      dismiss,
      success: (title, description) => toast({ tone: 'success', title, description }),
      error: (title, description) => toast({ tone: 'error', title, description }),
      warning: (title, description) => toast({ tone: 'warning', title, description }),
      info: (title, description) => toast({ tone: 'info', title, description }),
    }),
    [toast, dismiss],
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      {isClient &&
        createPortal(
          <div
            // `polite` so a confirmation does not interrupt whatever the
            // screen reader is currently saying.
            aria-live="polite"
            aria-atomic="false"
            className={cn(
              'pointer-events-none fixed z-[60] flex flex-col gap-2',
              // Mobile: bottom, above the bottom nav, full width minus gutters.
              'inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))]',
              // Desktop: top-right, fixed width.
              'sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-4 sm:w-96',
            )}
          >
            {toasts.map((t) => (
              <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
            ))}
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  )
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  return (
    <div
      role={toast.tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'pointer-events-auto flex items-start gap-3 rounded-xl border border-border bg-surface p-3.5 shadow-e4',
        'animate-slide-up sm:animate-slide-in-right',
      )}
    >
      <span className={cn('mt-px shrink-0 [&_svg]:size-5', TONE_CLASS[toast.tone])} aria-hidden="true">
        {ICONS[toast.tone]}
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-snug text-foreground">{toast.title}</p>
        {toast.description && (
          <p className="mt-0.5 text-sm leading-snug text-muted-foreground">{toast.description}</p>
        )}
        {toast.action && (
          <button
            type="button"
            onClick={() => {
              toast.action?.onClick()
              onDismiss()
            }}
            className="mt-2 text-sm font-semibold text-primary underline-offset-4 hover:underline"
          >
            {toast.action.label}
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="-m-1 shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <X className="size-4" />
      </button>
    </div>
  )
}

export function useToast(): ToastContextValue {
  const ctx = React.useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}
