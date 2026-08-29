import * as React from 'react'
import { cn } from '@/lib/utils/cn'

/**
 * The surface every panel in the product sits on.
 *
 * Padding steps up at `sm:` — a phone cannot afford 24px of gutter on both
 * sides of a 320px screen, but a desktop panel looks cramped without it.
 */

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** `raised` lifts the card off the page; `flat` removes the shadow entirely. */
  elevation?: 'flat' | 'raised' | 'floating'
  /** Adds hover affordance. Only use when the whole card is clickable. */
  interactive?: boolean
  as?: 'div' | 'article' | 'section' | 'li'
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(function Card(
  { className, elevation = 'raised', interactive = false, as: Tag = 'div', ...props },
  ref,
) {
  // A polymorphic tag cannot share one ref type across div/article/section/li,
  // so the element type is widened here rather than at every call site.
  const Element = Tag as React.ElementType

  return (
    <Element
      ref={ref}
      className={cn(
        'rounded-xl border border-border bg-surface text-surface-foreground',
        elevation === 'flat' && 'shadow-none',
        elevation === 'raised' && 'shadow-e1',
        elevation === 'floating' && 'shadow-e3',
        interactive &&
          'transition-[box-shadow,border-color,transform] duration-150 ' +
            'hover:border-border-strong hover:shadow-e2 ' +
            'focus-within:border-primary/40 active:scale-[0.995] motion-reduce:active:scale-100',
        className,
      )}
      {...props}
    />
  )
})

export const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  function CardHeader({ className, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cn('flex flex-col gap-1 p-4 sm:p-5', className)}
        {...props}
      />
    )
  },
)

/**
 * A header with a title on the left and actions on the right, which wraps to
 * two rows rather than squeezing the action off-screen on a narrow phone.
 */
export function CardHeaderRow({
  title,
  description,
  actions,
  className,
  ...props
}: {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'title'>) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-start justify-between gap-x-4 gap-y-2 p-4 sm:p-5',
        className,
      )}
      {...props}
    >
      <div className="min-w-0 flex-1">
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription className="mt-1">{description}</CardDescription>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}

export const CardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement> & { as?: 'h2' | 'h3' | 'h4' }
>(function CardTitle({ className, as: Tag = 'h3', ...props }, ref) {
  return (
    <Tag
      ref={ref}
      className={cn('text-base font-semibold leading-tight tracking-tight', className)}
      {...props}
    />
  )
})

export const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(function CardDescription({ className, ...props }, ref) {
  return (
    <p ref={ref} className={cn('text-sm leading-relaxed text-muted-foreground', className)} {...props} />
  )
})

export const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  function CardContent({ className, ...props }, ref) {
    return <div ref={ref} className={cn('p-4 pt-0 sm:p-5 sm:pt-0', className)} {...props} />
  },
)

export const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  function CardFooter({ className, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cn(
          'flex flex-col-reverse gap-2 border-t border-border p-4 sm:flex-row sm:items-center sm:justify-end sm:p-5',
          className,
        )}
        {...props}
      />
    )
  },
)

/** A horizontal rule that spans the full card, ignoring its padding. */
export function CardDivider({ className }: { className?: string }) {
  return <div className={cn('h-px w-full bg-border', className)} role="presentation" />
}
