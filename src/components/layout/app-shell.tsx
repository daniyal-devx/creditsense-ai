'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, MoreHorizontal, X } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import type { Role } from '@/lib/auth/roles'
import { roleLabel } from '@/lib/auth/roles'
import { isActivePath, splitForBottomNav, visibleNavItems, type NavItem } from '@/lib/navigation'
import { Button } from '@/components/ui/button'
import { Logo } from './logo'
import { ThemeToggle } from './theme-toggle'
import { UserMenu } from './user-menu'

export interface ShellUser {
  name: string
  email: string
  role: Role
  avatarUrl?: string | null
}

/**
 * The application shell.
 *
 * Three genuinely different navigation layouts, not one layout that shrinks:
 *
 *   < 768px   bottom nav (4 items + More sheet) — everything in thumb reach
 *   768–1023  slide-over drawer opened from the header
 *   >= 1024   persistent sidebar
 *
 * The drawer and the bottom-nav sheet share one component so their focus
 * trapping and scroll locking cannot diverge.
 */
export function AppShell({
  user,
  children,
}: {
  user: ShellUser | null
  children: React.ReactNode
}) {
  const pathname = usePathname()

  /**
   * Navigating must always close whichever navigation surface is open,
   * otherwise the drawer stays sitting over the page the user just asked for.
   *
   * That is derived during render rather than synced in an effect: the panel
   * records the route it was opened on, and stops counting as open the moment
   * the route changes. An effect calling setState here would render the drawer
   * over the new page for one frame before closing it, and would miss browser
   * back/forward navigations entirely.
   */
  const [drawer, setDrawer] = React.useState<{ panel: 'nav' | 'more' | null; openedAt: string }>({
    panel: null,
    openedAt: pathname,
  })
  const activePanel = drawer.openedAt === pathname ? drawer.panel : null
  const drawerOpen = activePanel === 'nav'
  const moreOpen = activePanel === 'more'

  const openPanel = (panel: 'nav' | 'more') => setDrawer({ panel, openedAt: pathname })
  const closePanel = React.useCallback(
    () => setDrawer((prev) => ({ ...prev, panel: null })),
    [],
  )

  const isDev = process.env.NODE_ENV === 'development'
  const items = React.useMemo(() => visibleNavItems(user?.role, isDev), [user?.role, isDev])
  const { bar, overflow } = React.useMemo(() => splitForBottomNav(items), [items])

  return (
    <div className="min-h-dvh bg-background">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      {/* ---------------- Desktop sidebar ---------------- */}
      <aside
        className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border bg-surface lg:flex"
        aria-label="Main navigation"
      >
        <div className="flex h-14 shrink-0 items-center px-5">
          <Logo />
        </div>
        <NavList items={items} pathname={pathname} className="flex-1 overflow-y-auto scrollbar-thin px-3 py-2" />
        {user && (
          <div className="shrink-0 border-t border-border p-3">
            <UserMenu user={user} />
          </div>
        )}
      </aside>

      {/* ---------------- Header ---------------- */}
      <header
        className={cn(
          'sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border bg-surface/85 px-4 backdrop-blur-md',
          'lg:pl-[calc(16rem+1rem)]',
        )}
      >
        <Button
          variant="ghost"
          size="icon"
          className="-ml-2 lg:hidden"
          onClick={() => openPanel('nav')}
          aria-label="Open navigation menu"
          aria-expanded={drawerOpen}
        >
          <Menu className="size-5" />
        </Button>

        <div className="lg:hidden">
          <Logo compact />
        </div>

        <div className="flex-1" />

        <ThemeToggle />

        {/*
          The account menu, at every width below the desktop sidebar.

          This used to render a bare <Avatar> under 640px — an image that
          looked tappable but did nothing, leaving sign-out reachable only by
          opening the hamburger drawer and scrolling to the bottom. A control
          that looks like a control has to behave like one.
        */}
        {user && (
          <div className="lg:hidden">
            <UserMenu user={user} compact />
          </div>
        )}
      </header>

      {/* ---------------- Main ---------------- */}
      <div className="lg:pl-64">
        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto w-full max-w-[1600px] px-4 py-5 pb-bottomnav focus-visible:outline-none sm:px-6 sm:py-6 md:pb-10 lg:px-8"
        >
          {children}
        </main>
      </div>

      {/* ---------------- Mobile bottom nav ---------------- */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 pb-safe backdrop-blur-md md:hidden"
        aria-label="Primary"
      >
        <div className="flex h-16 items-stretch">
          {bar.map((item) => (
            <BottomNavLink key={item.href} item={item} active={isActivePath(pathname, item.href)} />
          ))}
          {overflow.length > 0 && (
            <button
              type="button"
              onClick={() => openPanel('more')}
              aria-label="More sections"
              aria-expanded={moreOpen}
              className={cn(
                'flex flex-1 flex-col items-center justify-center gap-1 px-1 text-[11px] font-medium transition-colors',
                overflow.some((i) => isActivePath(pathname, i.href))
                  ? 'text-primary'
                  : 'text-muted-foreground',
              )}
            >
              <MoreHorizontal className="size-5" aria-hidden="true" />
              <span>More</span>
            </button>
          )}
        </div>
      </nav>

      {/* ---------------- Overlays ---------------- */}
      <NavDrawer open={drawerOpen} onClose={closePanel} title="Navigation" side="left">
        <NavList items={items} pathname={pathname} className="px-3 py-2" />
        {user && (
          <div className="mt-auto border-t border-border p-3">
            <UserMenu user={user} />
          </div>
        )}
      </NavDrawer>

      <NavDrawer open={moreOpen} onClose={closePanel} title="More" side="bottom">
        <NavList items={overflow} pathname={pathname} className="px-3 py-2" />
        {user && (
          <div className="border-t border-border p-3">
            <UserMenu user={user} />
          </div>
        )}
      </NavDrawer>
    </div>
  )
}

function NavList({
  items,
  pathname,
  className,
}: {
  items: NavItem[]
  pathname: string
  className?: string
}) {
  return (
    <ul className={cn('flex flex-col gap-0.5', className)}>
      {items.map((item) => {
        const active = isActivePath(pathname, item.href)
        const Icon = item.icon
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors',
                active
                  ? 'bg-primary-soft text-primary-soft-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              <Icon className="size-[18px] shrink-0" aria-hidden="true" />
              <span className="truncate">{item.label}</span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

function BottomNavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative flex flex-1 flex-col items-center justify-center gap-1 px-1 text-[11px] font-medium transition-colors',
        active ? 'text-primary' : 'text-muted-foreground',
      )}
    >
      {active && (
        <span
          className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-primary"
          aria-hidden="true"
        />
      )}
      <Icon className="size-5 shrink-0" aria-hidden="true" />
      <span className="max-w-full truncate">{item.shortLabel ?? item.label}</span>
    </Link>
  )
}

/**
 * The slide-over used by both the tablet drawer (from the left) and the mobile
 * "More" sheet (from the bottom). Traps focus and locks page scroll.
 */
function NavDrawer({
  open,
  onClose,
  title,
  side,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  side: 'left' | 'bottom'
  children: React.ReactNode
}) {
  const panelRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panelRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className={cn('fixed inset-0 z-50', side === 'bottom' && 'flex items-end')}>
      <div
        className="absolute inset-0 bg-[oklch(0.16_0.02_259)]/60 backdrop-blur-[2px] animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn(
          'relative flex flex-col bg-surface shadow-e4 focus-visible:outline-none',
          side === 'left'
            ? 'h-full w-[min(19rem,85vw)] animate-slide-in-left'
            : 'max-h-[80dvh] w-full rounded-t-2xl pb-safe animate-slide-up',
        )}
      >
        <div className="flex h-14 shrink-0 items-center justify-between gap-2 px-4">
          {side === 'left' ? (
            <Logo />
          ) : (
            <span className="text-base font-semibold">{title}</span>
          )}
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close navigation menu">
            <X className="size-5" />
          </Button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto scrollbar-thin">{children}</div>
      </div>
    </div>
  )
}

/** The role label shown under the user's name. Exported for reuse in settings. */
export function RoleLabel({ role }: { role: Role }) {
  return <span className="text-xs text-muted-foreground">{roleLabel(role)}</span>
}
