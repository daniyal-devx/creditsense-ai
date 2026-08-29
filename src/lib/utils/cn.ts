import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merge Tailwind classes so that later classes reliably win over earlier ones.
 *
 * Without this, `cn('p-2', 'p-4')` would emit both and let CSS source order
 * decide — which makes component `className` overrides unpredictable.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
