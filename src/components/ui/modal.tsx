'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { useIsClient } from '@/lib/utils/use-is-client'
import { Button } from './button'

/**
 * A modal dialog with a real focus trap.
 *
 * On mobile it becomes a bottom sheet: full width, anchored to the bottom,
 * rounded only at the top, and reachable with a thumb. A centred dialog on a
 * 320px screen leaves the action buttons stranded in the middle of the display.
 */

export interface ModalProps {
  open: boolean
  onClose: () => void
  title: React.ReactNode
  description?: React.ReactNode
  children?: React.ReactNode
  /** Buttons for the footer. Rendered reversed on mobile so primary sits on top. */
  footer?: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  /** Blocks backdrop-click and Escape. Use for destructive confirmations only. */
  dismissible?: boolean
  className?: string
}

const SIZES = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-lg',
  xl: 'sm:max-w-2xl',
}

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  dismissible = true,
  className,
}: ModalProps) {
  const panelRef = React.useRef<HTMLDivElement>(null)
  const previouslyFocused = React.useRef<HTMLElement | null>(null)
  const isClient = useIsClient()
  const titleId = React.useId()
  const descId = React.useId()

  // Lock the page behind the dialog, remembering the scroll position so the
  // page does not jump to the top when the dialog closes.
  React.useEffect(() => {
    if (!open) return
    const { body } = document
    const scrollY = window.scrollY
    const prev = {
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
      overflow: body.style.overflow,
    }
    body.style.position = 'fixed'
    body.style.top = `-${scrollY}px`
    body.style.width = '100%'
    body.style.overflow = 'hidden'
    return () => {
      body.style.position = prev.position
      body.style.top = prev.top
      body.style.width = prev.width
      body.style.overflow = prev.overflow
      window.scrollTo(0, scrollY)
    }
  }, [open])

  // Move focus in on open, and restore it to the trigger on close.
  React.useEffect(() => {
    if (!open) return
    previouslyFocused.current = document.activeElement as HTMLElement | null
    const id = window.setTimeout(() => {
      const panel = panelRef.current
      if (!panel) return
      const first = panel.querySelector<HTMLElement>(FOCUSABLE)
      ;(first ?? panel).focus()
    }, 0)
    return () => {
      window.clearTimeout(id)
      previouslyFocused.current?.focus?.()
    }
  }, [open])

  // Escape to close, Tab cycles within the dialog.
  React.useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissible) {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key !== 'Tab') return

      const panel = panelRef.current
      if (!panel) return
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      )
      if (items.length === 0) {
        e.preventDefault()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [open, dismissible, onClose])

  if (!isClient || !open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div
        className="absolute inset-0 bg-[oklch(0.16_0.02_259)]/60 backdrop-blur-[2px] animate-fade-in"
        onClick={dismissible ? onClose : undefined}
        aria-hidden="true"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cn(
          'relative flex max-h-[92dvh] w-full flex-col overflow-hidden bg-surface shadow-e4',
          'rounded-t-2xl sm:rounded-2xl',
          'animate-slide-up sm:animate-scale-in',
          SIZES[size],
          className,
        )}
      >
        {/* Grab handle — signals "swipe/tap away" on the mobile sheet. */}
        <div className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-border-strong sm:hidden" aria-hidden="true" />

        <div className="flex items-start justify-between gap-4 p-4 pb-3 sm:p-6 sm:pb-4">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-balance text-lg font-semibold leading-tight">
              {title}
            </h2>
            {description && (
              <p id={descId} className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {description}
              </p>
            )}
          </div>
          {dismissible && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onClose}
              aria-label="Close dialog"
              className="-mr-1 -mt-1 shrink-0"
            >
              <X className="size-4" />
            </Button>
          )}
        </div>

        {children && (
          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-4 pb-4 sm:px-6">{children}</div>
        )}

        {footer && (
          <div className="flex flex-col-reverse gap-2 border-t border-border bg-surface-sunken p-4 pb-safe sm:flex-row sm:items-center sm:justify-end sm:p-4 sm:px-6">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

/**
 * The confirmation dialog for anything irreversible — rejecting an application,
 * revoking a user. `tone="danger"` colours the confirm button accordingly.
 */
export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'primary',
  loading = false,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void | Promise<void>
  title: React.ReactNode
  description?: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'primary' | 'danger'
  loading?: boolean
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      dismissible={!loading}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading} fullWidth className="sm:w-auto">
            {cancelLabel}
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            onClick={onConfirm}
            loading={loading}
            fullWidth
            className="sm:w-auto"
          >
            {confirmLabel}
          </Button>
        </>
      }
    />
  )
}
