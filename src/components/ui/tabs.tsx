'use client'

import * as React from 'react'
import { cn } from '@/lib/utils/cn'

/**
 * Tabs with full keyboard support (arrow keys, Home, End) and correct ARIA.
 *
 * The tab list scrolls horizontally on narrow screens rather than wrapping or
 * shrinking labels to nothing — this is how the applicant view collapses its
 * four side-by-side desktop panels into one-at-a-time on a phone.
 */

interface TabsContextValue {
  value: string
  setValue: (value: string) => void
  baseId: string
}

const TabsContext = React.createContext<TabsContextValue | null>(null)

export function Tabs({
  value: controlledValue,
  defaultValue,
  onValueChange,
  children,
  className,
}: {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  children: React.ReactNode
  className?: string
}) {
  const baseId = React.useId()
  const [uncontrolled, setUncontrolled] = React.useState(defaultValue ?? '')
  const isControlled = controlledValue !== undefined
  const value = isControlled ? controlledValue : uncontrolled

  const setValue = React.useCallback(
    (next: string) => {
      if (!isControlled) setUncontrolled(next)
      onValueChange?.(next)
    },
    [isControlled, onValueChange],
  )

  const ctx = React.useMemo(() => ({ value, setValue, baseId }), [value, setValue, baseId])

  return (
    <TabsContext.Provider value={ctx}>
      <div className={cn('flex w-full min-w-0 flex-col', className)}>{children}</div>
    </TabsContext.Provider>
  )
}

function useTabs() {
  const ctx = React.useContext(TabsContext)
  if (!ctx) throw new Error('Tabs components must be used inside <Tabs>')
  return ctx
}

export function TabList({
  children,
  className,
  'aria-label': ariaLabel,
}: {
  children: React.ReactNode
  className?: string
  'aria-label': string
}) {
  const listRef = React.useRef<HTMLDivElement>(null)

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const keys = ['ArrowRight', 'ArrowLeft', 'Home', 'End']
    if (!keys.includes(e.key)) return

    const tabs = Array.from(
      listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]:not([disabled])') ?? [],
    )
    if (tabs.length === 0) return

    const current = tabs.findIndex((t) => t === document.activeElement)
    let next = current
    if (e.key === 'ArrowRight') next = (current + 1) % tabs.length
    else if (e.key === 'ArrowLeft') next = (current - 1 + tabs.length) % tabs.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = tabs.length - 1

    e.preventDefault()
    tabs[next]?.focus()
    tabs[next]?.click()
  }

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={cn(
        'no-scrollbar -mx-4 flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border px-4 sm:mx-0 sm:px-0',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function Tab({
  value,
  children,
  disabled,
  badge,
  className,
}: {
  value: string
  children: React.ReactNode
  disabled?: boolean
  /** A count or status chip after the label — e.g. how many items in the queue. */
  badge?: React.ReactNode
  className?: string
}) {
  const { value: active, setValue, baseId } = useTabs()
  const selected = active === value

  return (
    <button
      type="button"
      role="tab"
      id={`${baseId}-tab-${value}`}
      aria-selected={selected}
      aria-controls={`${baseId}-panel-${value}`}
      // Only the active tab is in the tab order; arrows move between the rest.
      tabIndex={selected ? 0 : -1}
      disabled={disabled}
      onClick={() => setValue(value)}
      className={cn(
        'relative -mb-px flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 text-sm font-medium transition-colors sm:min-h-10',
        selected
          ? 'border-primary text-foreground'
          : 'border-transparent text-muted-foreground hover:border-border-strong hover:text-foreground',
        disabled && 'cursor-not-allowed opacity-50 hover:border-transparent hover:text-muted-foreground',
        className,
      )}
    >
      {children}
      {badge}
    </button>
  )
}

export function TabPanel({
  value,
  children,
  className,
  /** Keep the panel mounted while hidden — preserves scroll and form state. */
  keepMounted = false,
}: {
  value: string
  children: React.ReactNode
  className?: string
  keepMounted?: boolean
}) {
  const { value: active, baseId } = useTabs()
  const selected = active === value

  if (!selected && !keepMounted) return null

  return (
    <div
      role="tabpanel"
      id={`${baseId}-panel-${value}`}
      aria-labelledby={`${baseId}-tab-${value}`}
      hidden={!selected}
      tabIndex={0}
      className={cn('min-w-0 pt-5 focus-visible:outline-none', className)}
    >
      {children}
    </div>
  )
}
