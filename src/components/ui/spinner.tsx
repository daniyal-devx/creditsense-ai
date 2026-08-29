import { cn } from '@/lib/utils/cn'

/**
 * A spinner means "this specific action is running".
 *
 * It is deliberately NOT the loading state for content — content uses
 * <Skeleton>, which preserves layout and avoids the shift that a spinner
 * causes when real data replaces it.
 */
export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <>
      <svg
        className={cn('animate-spin-slow size-4', className)}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        focusable="false"
      >
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" className="opacity-25" />
        <path
          d="M21 12a9 9 0 0 0-9-9"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
      {label && <span className="sr-only">{label}</span>}
    </>
  )
}
