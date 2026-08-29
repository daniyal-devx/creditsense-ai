import Link from 'next/link'
import { cn } from '@/lib/utils/cn'

/**
 * The product mark: a rising signal line inside a rounded square.
 *
 * It is deliberately literal — the whole premise of CreditSense is reading a
 * behavioural signal that a traditional bureau cannot see.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground',
        className,
      )}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" fill="none" className="size-[18px]">
        <path
          d="M4 16.5 8.5 11l3.5 3.5L20 6"
          stroke="currentColor"
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="20" cy="6" r="2" fill="currentColor" />
      </svg>
    </span>
  )
}

export function Logo({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <Link
      href="/dashboard"
      className={cn('flex min-w-0 items-center gap-2.5 rounded-lg', className)}
    >
      <LogoMark />
      <span className={cn('min-w-0 truncate', compact && 'sr-only sm:not-sr-only')}>
        <span className="block text-[15px] font-semibold leading-none tracking-tight text-foreground">
          CreditSense
        </span>
        <span className="mt-0.5 block text-[10px] font-medium uppercase leading-none tracking-[0.14em] text-muted-foreground">
          AI
        </span>
      </span>
    </Link>
  )
}
