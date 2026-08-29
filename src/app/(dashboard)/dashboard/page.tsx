import type { Metadata } from 'next'
import Link from 'next/link'
import {
  CheckCircle2,
  Circle,
  Database,
  ExternalLink,
  Loader2,
  Sparkles,
} from 'lucide-react'
import { PageHeader, Section } from '@/components/layout/page-header'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeaderRow } from '@/components/ui/card'
import { checkDbHealth, isDbConfigured } from '@/lib/db/client'
import { PHASES } from '@/lib/phases'
import { cn } from '@/lib/utils/cn'

export const metadata: Metadata = { title: 'Dashboard' }
export const dynamic = 'force-dynamic'

/**
 * The Phase 0 dashboard.
 *
 * Until the real role dashboards land in Phase 7, this is the build's status
 * page: it proves the deployed app can reach the database and shows what has
 * been built so far. Phase 7 replaces the body with the role-aware home.
 */
export default async function DashboardPage() {
  const configured = isDbConfigured()
  const db = configured ? await checkDbHealth() : null

  const done = PHASES.filter((p) => p.status === 'done').length
  const inProgress = PHASES.find((p) => p.status === 'in-progress')

  return (
    <>
      <PageHeader
        title="Build status"
        description="CreditSense AI is being built phase by phase. This page confirms the deployed app is healthy and shows what has shipped so far."
        badge={
          <Badge tone="primary" icon={<Sparkles />}>
            Phase 0
          </Badge>
        }
        actions={
          // A real anchor styled as a button, so it opens in a new tab from the
          // context menu and works with JavaScript disabled.
          <Link
            href="/api/health"
            target="_blank"
            rel="noreferrer"
            className={buttonVariants({ variant: 'secondary' })}
          >
            Raw health JSON
            <ExternalLink className="ml-2 size-4" aria-hidden="true" />
          </Link>
        }
      />

      <div className="flex flex-col gap-6">
        {/* -------- Database connectivity -------- */}
        <Section title="Infrastructure">
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeaderRow
                title="Database"
                description="Supabase PostgreSQL over the transaction pooler"
                actions={
                  db?.ok ? (
                    <Badge tone="success" icon={<CheckCircle2 />}>
                      Connected
                    </Badge>
                  ) : (
                    <Badge tone="danger" icon={<Circle />}>
                      {configured ? 'Unreachable' : 'Not configured'}
                    </Badge>
                  )
                }
              />
              <CardContent>
                {db?.ok ? (
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                    <div>
                      <dt className="text-muted-foreground">Round trip</dt>
                      <dd className="mt-0.5 font-medium tabular-nums">{db.latencyMs} ms</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">PostgreSQL</dt>
                      <dd className="mt-0.5 font-medium tabular-nums">{db.version ?? '—'}</dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-muted-foreground">Tables in public schema</dt>
                      <dd className="mt-0.5 font-medium tabular-nums">
                        {db.tableCount}
                        {db.tableCount === 0 && (
                          <span className="ml-2 font-normal text-muted-foreground">
                            — schema arrives in Phase 1
                          </span>
                        )}
                      </dd>
                    </div>
                  </dl>
                ) : (
                  <Alert tone="danger" title={configured ? 'Cannot reach the database' : 'DATABASE_URL is not set'}>
                    {configured
                      ? db?.error
                      : 'Copy .env.example to .env.local and fill in the Supabase pooler connection string.'}
                  </Alert>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeaderRow
                title="Design system"
                description="Shared components, tokens, and both themes"
                actions={
                  <Badge tone="success" icon={<CheckCircle2 />}>
                    Ready
                  </Badge>
                }
              />
              <CardContent>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Every component below is built mobile-first with 44px tap targets, keyboard
                  support, and designed loading, empty and error states.
                </p>
                <Link
                  href="/design-system"
                  className={buttonVariants({
                    variant: 'secondary',
                    className: 'mt-4 w-full sm:w-auto',
                  })}
                >
                  Open the component gallery
                </Link>
              </CardContent>
            </Card>
          </div>
        </Section>

        {/* -------- Phase progress -------- */}
        <Section
          title="Build phases"
          description={`${done} of ${PHASES.length} complete${inProgress ? ` · currently building ${inProgress.title}` : ''}`}
        >
          <Card>
            <ol className="divide-y divide-border">
              {PHASES.map((phase) => (
                <li key={phase.number} className="flex items-start gap-3 p-4 sm:gap-4 sm:p-5">
                  <span className="mt-0.5 shrink-0" aria-hidden="true">
                    {phase.status === 'done' ? (
                      <CheckCircle2 className="size-5 text-success" />
                    ) : phase.status === 'in-progress' ? (
                      <Loader2 className="size-5 animate-spin-slow text-primary" />
                    ) : (
                      <Circle className="size-5 text-muted-foreground/40" />
                    )}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Phase {phase.number}
                      </span>
                      <h3
                        className={cn(
                          'text-sm font-semibold',
                          phase.status === 'todo' && 'text-muted-foreground',
                        )}
                      >
                        {phase.title}
                      </h3>
                    </div>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      {phase.answers}
                    </p>
                  </div>

                  <span className="shrink-0">
                    {phase.status === 'done' ? (
                      <Badge tone="success" size="sm">
                        Done
                      </Badge>
                    ) : phase.status === 'in-progress' ? (
                      <Badge tone="primary" size="sm">
                        Building
                      </Badge>
                    ) : (
                      <Badge tone="neutral" size="sm">
                        Queued
                      </Badge>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          </Card>
        </Section>

        <Alert tone="info" icon={<Database />} title="Where the real dashboards go">
          Phase 7 replaces this page with the role-aware home — the Loan Officer sees their
          application queue, the Risk Analyst sees portfolio distribution, the Fraud Analyst sees
          flagged applicants.
        </Alert>
      </div>
    </>
  )
}
