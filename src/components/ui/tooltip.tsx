'use client'

import * as React from 'react'
import { HelpCircle } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

/**
 * A tooltip that works with a finger.
 *
 * The house rule is "no hover-only actions", and an explanation the loan
 * officer needs in order to understand a figure is an action. So this opens on
 * hover, on keyboard focus, AND on tap — the trigger is a real button, not a
 * `title` attribute or a hover-only span.
 */
export function Tooltip({
  content,
  children,
  side = 'top',
  className,
}: {
  content: React.ReactNode
  children: React.ReactNode
  side?: 'top' | 'bottom'
  className?: string
}) {
  const [open, setOpen] = React.useState(false)
  const id = React.useId()
  const wrapRef = React.useRef<HTMLSpanElement>(null)

  // A tap outside closes it — the touch equivalent of moving the mouse away.
  React.useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <span ref={wrapRef} className={cn('relative inline-flex', className)}>
      <button
        type="button"
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="inline-flex items-center rounded text-muted-foreground transition-colors hover:text-foreground"
      >
        {children}
      </button>

      {open && (
        <span
          id={id}
          role="tooltip"
          className={cn(
            'absolute left-1/2 z-50 w-max max-w-[min(16rem,calc(100vw-2rem))] -translate-x-1/2 rounded-lg bg-foreground px-3 py-2 text-xs font-medium leading-relaxed text-background shadow-e3 animate-fade-in',
            side === 'top' ? 'bottom-[calc(100%+8px)]' : 'top-[calc(100%+8px)]',
          )}
        >
          {content}
        </span>
      )}
    </span>
  )
}

/** The common case: a small "?" next to a label that explains a term. */
export function InfoTip({ content, label }: { content: React.ReactNode; label: string }) {
  return (
    <Tooltip content={content}>
      <HelpCircle className="size-4" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </Tooltip>
  )
}
