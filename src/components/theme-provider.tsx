'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from 'react'

export type Theme = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'creditsense-theme'
/** Broadcast so every subscriber re-reads after a change in this tab. */
const CHANGE_EVENT = 'creditsense:themechange'

interface ThemeContextValue {
  /** What the user chose — may be `"system"`. */
  theme: Theme
  /** What is actually rendered right now — never `"system"`. */
  resolvedTheme: 'light' | 'dark'
  setTheme: (theme: Theme) => void
  /** Cycles light -> dark -> system. */
  cycleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

/**
 * Runs before first paint, inlined into <head>.
 *
 * Without this the server renders the light theme, then React hydrates and
 * switches to dark — a white flash on every page load for dark-mode users.
 * Keep it dependency-free and synchronous; it must not throw even when
 * localStorage is unavailable (private windows, embedded webviews).
 */
export const THEME_INIT_SCRIPT = `
(function() {
  try {
    var stored = localStorage.getItem('${STORAGE_KEY}');
    var theme = stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
    var dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    var root = document.documentElement;
    root.classList.toggle('dark', dark);
    root.style.colorScheme = dark ? 'dark' : 'light';
  } catch (e) {}
})();
`.trim()

function readStoredTheme(): Theme {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw
  } catch {
    /* localStorage blocked — fall back to following the system */
  }
  return 'system'
}

function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function resolve(theme: Theme): 'light' | 'dark' {
  return theme === 'dark' || (theme === 'system' && systemPrefersDark()) ? 'dark' : 'light'
}

/**
 * The theme lives in localStorage and in the OS preference — both are external
 * to React, so it is read with `useSyncExternalStore` rather than mirrored into
 * state via an effect. That keeps the server snapshot explicit and avoids the
 * extra render pass a `useState` + `useEffect` mirror would cause on mount.
 */
function subscribe(onChange: () => void): () => void {
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  // `storage` covers changes made in another tab; the custom event covers
  // changes made in this one.
  window.addEventListener('storage', onChange)
  window.addEventListener(CHANGE_EVENT, onChange)
  mq.addEventListener('change', onChange)
  return () => {
    window.removeEventListener('storage', onChange)
    window.removeEventListener(CHANGE_EVENT, onChange)
    mq.removeEventListener('change', onChange)
  }
}

// Both snapshots return primitives, so they are referentially stable and
// cannot loop the store.
const getThemeSnapshot = (): Theme => readStoredTheme()
const getServerThemeSnapshot = (): Theme => 'system'
const getResolvedSnapshot = (): 'light' | 'dark' => resolve(readStoredTheme())
const getServerResolvedSnapshot = (): 'light' | 'dark' => 'light'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(subscribe, getThemeSnapshot, getServerThemeSnapshot)
  const resolvedTheme = useSyncExternalStore(
    subscribe,
    getResolvedSnapshot,
    getServerResolvedSnapshot,
  )

  // Push the resolved theme onto <html>. This is a genuine external-system
  // sync — the inline script did it for the first paint, this keeps it correct
  // afterwards when the choice or the OS preference changes.
  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', resolvedTheme === 'dark')
    root.style.colorScheme = resolvedTheme
  }, [resolvedTheme])

  const setTheme = useCallback((next: Theme) => {
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* not fatal — the choice just will not persist across reloads */
    }
    window.dispatchEvent(new Event(CHANGE_EVENT))
  }, [])

  const cycleTheme = useCallback(() => {
    setTheme(theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light')
  }, [theme, setTheme])

  const value = useMemo(
    () => ({ theme, resolvedTheme, setTheme, cycleTheme }),
    [theme, resolvedTheme, setTheme, cycleTheme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>')
  return ctx
}
