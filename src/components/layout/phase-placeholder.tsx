import Link from 'next/link'
import { Hammer } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { phase } from '@/lib/phases'

/**
 * A section that is navigable but not built yet.
 *
 * The alternative — leaving the route out of the nav until its phase lands —
 * hides the shape of the product and makes the shell impossible to test at
 * every breakpoint. This keeps every route reachable and says plainly what
 * arrives when, rather than showing a blank page or a fake screen.
 */
export function PhasePlaceholder({
  title,
  description,
  phaseNumber,
  whatArrives,
  breadcrumbs,
}: {
  title: string
  description: string
  phaseNumber: number
  /** The bullet points this screen will hold once its phase is done. */
  whatArrives: string[]
  breadcrumbs?: { label: string; href?: string }[]
}) {
  const p = phase(phaseNumber)

  return (
    <>
      <PageHeader
        title={title}
        description={description}
        breadcrumbs={breadcrumbs}
        badge={<Badge tone="neutral">Phase {p.number}</Badge>}
      />

      <Card>
        <EmptyState
          icon={<Hammer />}
          title={`Arrives in Phase ${p.number} — ${p.title}`}
          description={
            <>
              <span className="block">{p.answers}</span>
              <ul className="mx-auto mt-4 max-w-sm list-disc space-y-1.5 pl-5 text-left">
                {whatArrives.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </>
          }
          action={
            <Link href="/dashboard" className={buttonVariants({ variant: 'secondary' })}>
              Back to build status
            </Link>
          }
        />
      </Card>
    </>
  )
}
