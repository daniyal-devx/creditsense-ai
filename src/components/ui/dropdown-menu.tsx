'use client'

import * as React from 'react'
import { cn } from '@/lib/utils/cn'

/**
 * A small dropdown menu — the user menu, row overflow actions.
 *
 * Keyboard: arrows move, Home/End jump, Escape closes and returns focus to the
 * trigger. On mobile it anchors to the right edge and is width-capped so it can
 * never push the page sideways.
 */

interface MenuContextValue {
  open: boolean
  setOpen: (open: boolean) => void
  triggerRef: React.RefObject<HTMLButtonElement | null>
}

const MenuContext = React.createContext<MenuContextValue | null>(null)

export function DropdownMenu({ children, className }: { children: React.ReactNode; className?: string }) {
  const [open, setOpen] = React.useState(false)
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const rootRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <MenuContext.Provider value={{ open, setOpen, triggerRef }}>
      <div ref={rootRef} className={cn('relative', className)}>
        {children}
      </div>
    </MenuContext.Provider>
  )
}

function useMenu() {
  const ctx = React.useContext(MenuContext)
  if (!ctx) throw new Error('Dropdown parts must be used inside <DropdownMenu>')
  return ctx
}

export function DropdownTrigger({
  children,
  className,
  'aria-label': ariaLabel,
}: {
  children: React.ReactNode
  className?: string
  'aria-label'?: string
}) {
  const { open, setOpen, triggerRef } = useMenu()
  return (
    <button
      ref={triggerRef}
      type="button"
      aria-haspopup="menu"
      aria-expanded={open}
      aria-label={ariaLabel}
      onClick={() => setOpen(!open)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setOpen(true)
        }
      }}
      className={cn(
        'inline-flex min-h-11 items-center gap-2 rounded-lg transition-colors sm:min-h-10',
        className,
      )}
    >
      {children}
    </button>
  )
}

export function DropdownContent({
  children,
  align = 'end',
  className,
}: {
  children: React.ReactNode
  align?: 'start' | 'end'
  className?: string
}) {
  const { open, setOpen, triggerRef } = useMenu()
  const listRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!open) return
    const first = listRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')
    first?.focus()
  }, [open])

  if (!open) return null

  const onKeyDown = (e: React.KeyboardEvent) => {
    const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End', 'Tab']
    if (!keys.includes(e.key)) return

    if (e.key === 'Tab') {
      setOpen(false)
      return
    }

    const items = Array.from(
      listRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? [],
    )
    if (items.length === 0) return

    const current = items.findIndex((el) => el === document.activeElement)
    let next = current
    if (e.key === 'ArrowDown') next = (current + 1) % items.length
    else if (e.key === 'ArrowUp') next = (current - 1 + items.length) % items.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = items.length - 1

    e.preventDefault()
    items[next]?.focus()
  }

  return (
    <div
      ref={listRef}
      role="menu"
      onKeyDown={onKeyDown}
      className={cn(
        'absolute z-50 mt-2 min-w-52 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border bg-surface p-1 shadow-e4 animate-scale-in',
        align === 'end' ? 'right-0 origin-top-right' : 'left-0 origin-top-left',
        className,
      )}
      onClick={() => {
        setOpen(false)
        triggerRef.current?.focus()
      }}
    >
      {children}
    </div>
  )
}

export function DropdownItem({
  children,
  onSelect,
  disabled,
  tone = 'default',
  icon,
  className,
}: {
  children: React.ReactNode
  onSelect?: () => void
  disabled?: boolean
  tone?: 'default' | 'danger'
  icon?: React.ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        'flex w-full min-h-11 items-center gap-2.5 rounded-lg px-3 text-left text-sm transition-colors sm:min-h-10',
        tone === 'danger'
          ? 'text-danger hover:bg-danger-soft focus-visible:bg-danger-soft'
          : 'text-foreground hover:bg-accent focus-visible:bg-accent',
        disabled && 'pointer-events-none opacity-50',
        '[&_svg]:size-4 [&_svg]:shrink-0',
        className,
      )}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </button>
  )
}

export function DropdownLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </div>
  )
}

export function DropdownSeparator() {
  return <div role="separator" className="my-1 h-px bg-border" />
}
