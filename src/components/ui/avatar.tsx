import * as React from 'react'
import { cn } from '@/lib/utils/cn'
import { initials as toInitials } from '@/lib/utils/format'

/**
 * An avatar. Falls back to initials on a colour derived from the name, so the
 * same person is always the same colour across the queue, the applicant view
 * and the audit log — which makes scanning a long list much faster.
 */

const PALETTE = [
  'bg-chart-1/15 text-chart-1',
  'bg-chart-2/15 text-chart-2',
  'bg-chart-3/15 text-chart-3',
  'bg-chart-4/20 text-chart-4',
  'bg-chart-5/15 text-chart-5',
  'bg-chart-6/15 text-chart-6',
]

/** Deterministic: the same name always yields the same swatch. */
function paletteFor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0
  }
  return PALETTE[Math.abs(hash) % PALETTE.length]
}

const SIZES = {
  xs: 'size-6 text-[10px]',
  sm: 'size-8 text-xs',
  md: 'size-10 text-sm',
  lg: 'size-12 text-base',
  xl: 'size-16 text-xl',
}

export interface AvatarProps {
  name: string
  src?: string | null
  size?: keyof typeof SIZES
  className?: string
}

export function Avatar({ name, src, size = 'md', className }: AvatarProps) {
  const [failed, setFailed] = React.useState(false)
  const showImage = src && !failed

  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold',
        !showImage && paletteFor(name),
        SIZES[size],
        className,
      )}
      // The name is nearly always shown in text right beside the avatar, so
      // repeating it here would just make a screen reader say it twice.
      aria-hidden="true"
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          className="size-full object-cover"
          onError={() => setFailed(true)}
          referrerPolicy="no-referrer"
        />
      ) : (
        toInitials(name)
      )}
    </span>
  )
}
