'use client'

import { Monitor, Moon, Sun } from 'lucide-react'
import { useTheme, type Theme } from '@/components/theme-provider'
import {
  DropdownContent,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
} from '@/components/ui/dropdown-menu'

const OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

/**
 * An explicit three-way picker rather than a two-state toggle.
 *
 * "System" has to be reachable: a user whose phone flips to dark at sunset
 * should be able to opt back into following it, which a light/dark switch
 * quietly takes away from them the first time they touch it.
 */
export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme()
  const Icon = theme === 'system' ? Monitor : resolvedTheme === 'dark' ? Moon : Sun
  const current = OPTIONS.find((o) => o.value === theme)?.label ?? 'System'

  return (
    <DropdownMenu>
      <DropdownTrigger
        aria-label={`Theme: ${current}. Change theme`}
        className="justify-center px-0 text-muted-foreground hover:bg-accent hover:text-foreground size-11 sm:size-10"
      >
        <Icon className="size-5" aria-hidden="true" />
      </DropdownTrigger>

      <DropdownContent>
        {OPTIONS.map((opt) => {
          const OptIcon = opt.icon
          return (
            <DropdownItem
              key={opt.value}
              icon={<OptIcon />}
              onSelect={() => setTheme(opt.value)}
              className={theme === opt.value ? 'bg-accent font-medium' : undefined}
            >
              {opt.label}
              {theme === opt.value && <span className="sr-only"> (selected)</span>}
            </DropdownItem>
          )
        })}
      </DropdownContent>
    </DropdownMenu>
  )
}

/** A compact inline variant for the settings page. */
export function ThemeSegmentedControl() {
  const { theme, setTheme } = useTheme()

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className="inline-flex w-full rounded-lg border border-border bg-surface-sunken p-1 sm:w-auto"
    >
      {OPTIONS.map((opt) => {
        const OptIcon = opt.icon
        const selected = theme === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => setTheme(opt.value)}
            className={
              'flex min-h-10 flex-1 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition-colors ' +
              (selected
                ? 'bg-surface text-foreground shadow-e1'
                : 'text-muted-foreground hover:text-foreground')
            }
          >
            <OptIcon className="size-4" aria-hidden="true" />
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
