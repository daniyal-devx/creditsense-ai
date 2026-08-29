import * as React from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

/**
 * The standard page frame: breadcrumb, title, description, action slot.
 *
 * Every page uses it so headings land in the same place and at the same size
 * on every screen. On mobile the actions drop below the title and go full
 * width rather than being squeezed alongside it.
 */

export interface Crumb {
  label: string
  /** Omit on the final crumb — the current page is not a link. */
  href?: string
}

export function Breadcrumbs({ items, className }: { items: Crumb[]; className?: string }) {
  if (items.length === 0) return null

  return (
    <nav aria-label="Breadcrumb" className={cn('min-w-0', className)}>
      <ol className="flex min-w-0 items-center gap-1 text-sm text-muted-foreground">
        {items.map((item, i) => {
          const last = i === items.length - 1
          return (
            <li key={`${item.label}-${i}`} className="flex min-w-0 items-center gap-1">
              {i > 0 && (
                <ChevronRight className="size-3.5 shrink-0 opacity-60" aria-hidden="true" />
              )}
              {item.href && !last ? (
                <Link
                  href={item.href}
                  className="truncate rounded transition-colors hover:text-foreground"
                >
                  {item.label}
                </Link>
              ) : (
                <span className={cn('truncate', last && 'text-foreground')} aria-current={last ? 'page' : undefined}>
                  {item.label}
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

export interface PageHeaderProps {
  title: React.ReactNode
  description?: React.ReactNode
  breadcrumbs?: Crumb[]
  /** Buttons for this page. Full width on mobile, inline from `sm:`. */
  actions?: React.ReactNode
  /** A badge or status chip rendered beside the title. */
  badge?: React.ReactNode
  className?: string
}

export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
  badge,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn('mb-5 flex flex-col gap-3 sm:mb-6', className)}>
      {breadcrumbs && breadcrumbs.length > 0 && <Breadcrumbs items={breadcrumbs} />}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="text-balance text-xl font-semibold leading-tight tracking-tight sm:text-2xl">
              {title}
            </h1>
            {badge}
          </div>
          {description && (
            <p className="mt-1.5 max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
          )}
        </div>

        {actions && (
          <div className="flex flex-col gap-2 sm:flex-row sm:shrink-0 sm:items-center [&>*]:w-full sm:[&>*]:w-auto">
            {actions}
          </div>
        )}
      </div>
    </div>
  )
}

/** A titled section within a page. */
export function Section({
  title,
  description,
  actions,
  children,
  className,
  id,
}: {
  title?: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
  id?: string
}) {
  return (
    <section id={id} className={cn('min-w-0', className)}>
      {(title || actions) && (
        <div className="mb-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            {title && <h2 className="text-base font-semibold leading-tight sm:text-lg">{title}</h2>}
            {description && (
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
            )}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  )
}

/**
 * The sticky action bar for decision screens.
 *
 * On mobile it pins above the bottom nav so approve/reject is always in thumb
 * reach without scrolling; on desktop it sits inline at the end of the page.
 */
export function StickyActionBar({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'fixed inset-x-0 bottom-16 z-20 flex gap-2 border-t border-border bg-surface/95 p-3 pb-safe backdrop-blur-md',
        'md:static md:mt-6 md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none',
        '[&>*]:flex-1 md:[&>*]:flex-none',
        className,
      )}
    >
      {children}
    </div>
  )
}
