import { cn } from '@/lib/utils/cn'

/**
 * Skeletons, not spinners, for content.
 *
 * A spinner tells the user "something is happening"; a skeleton tells them
 * *what is coming and where it will be*, so the page does not jump when the
 * data lands. Every skeleton here is sized to match the real component it
 * stands in for — that matching is the whole point.
 */
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-md bg-muted',
        // A sweep rather than a pulse: it reads as progress instead of
        // as a broken element blinking.
        'after:absolute after:inset-0 after:-translate-x-full after:bg-gradient-to-r ' +
          'after:from-transparent after:via-foreground/[0.06] after:to-transparent ' +
          'after:animate-[cs-shimmer_1.6s_infinite] motion-reduce:after:animate-none',
        className,
      )}
      aria-hidden="true"
      {...props}
    />
  )
}

/** A block of body copy. */
export function SkeletonText({
  lines = 3,
  className,
}: {
  lines?: number
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn('h-4', i === lines - 1 && lines > 1 ? 'w-3/5' : 'w-full')}
        />
      ))}
    </div>
  )
}

/** Stands in for a <Card> with a header and a few lines of content. */
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-xl border border-border bg-surface p-4 shadow-e1 sm:p-5', className)}>
      <Skeleton className="h-5 w-2/5" />
      <Skeleton className="mt-2 h-4 w-3/5" />
      <div className="mt-5 flex flex-col gap-2.5">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-4/6" />
      </div>
    </div>
  )
}

/** Stands in for a stat tile in a dashboard KPI row. */
export function SkeletonStat({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-xl border border-border bg-surface p-4 shadow-e1 sm:p-5', className)}>
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-3 h-8 w-32" />
      <Skeleton className="mt-2 h-3 w-20" />
    </div>
  )
}

/**
 * Stands in for a DataTable. Renders the desktop table shape and the mobile
 * card shape at the same breakpoints the real table switches at, so the
 * loading layout matches the loaded layout on every screen size.
 */
export function SkeletonTable({
  rows = 6,
  columns = 5,
  className,
}: {
  rows?: number
  columns?: number
  className?: string
}) {
  return (
    <div className={className}>
      {/* Desktop: a real table shape */}
      <div className="hidden overflow-hidden rounded-xl border border-border bg-surface shadow-e1 md:block">
        <div className="flex gap-4 border-b border-border bg-surface-sunken px-4 py-3">
          {Array.from({ length: columns }).map((_, i) => (
            <Skeleton key={i} className={cn('h-4', i === 0 ? 'w-40' : 'flex-1')} />
          ))}
        </div>
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex items-center gap-4 border-b border-border px-4 py-4 last:border-0">
            {Array.from({ length: columns }).map((_, c) => (
              <Skeleton key={c} className={cn('h-4', c === 0 ? 'w-40' : 'flex-1')} />
            ))}
          </div>
        ))}
      </div>

      {/* Mobile: stacked cards */}
      <div className="flex flex-col gap-3 md:hidden">
        {Array.from({ length: Math.min(rows, 4) }).map((_, r) => (
          <div key={r} className="rounded-xl border border-border bg-surface p-4 shadow-e1">
            <div className="flex items-start justify-between gap-3">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
            <Skeleton className="mt-3 h-4 w-24" />
            <Skeleton className="mt-2 h-4 w-40" />
          </div>
        ))}
      </div>
    </div>
  )
}
