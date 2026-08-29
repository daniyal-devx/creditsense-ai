import type { Metadata } from 'next'
import { Suspense } from 'react'
import { Database, FileText, Receipt, Smartphone, Users } from 'lucide-react'
import { PageHeader, Section } from '@/components/layout/page-header'
import { Alert } from '@/components/ui/alert'
import { Card, CardContent } from '@/components/ui/card'
import { SkeletonStat, SkeletonTable } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/ui/states'
import { getSignalCoverage, listCustomers } from '@/lib/db/customers'
import { formatDate, formatNumber, formatPKR, formatPercent } from '@/lib/utils/format'
import { CustomersTable } from './customers-table'

export const metadata: Metadata = { title: 'Customers' }
export const dynamic = 'force-dynamic'

/**
 * The digital-signal population.
 *
 * Phase 1's proof: every one of these people is invisible to a credit bureau,
 * and every one of them has a queryable behavioural profile built from wallet,
 * top-up and utility payment data.
 */
export default function CustomersPage() {
  return (
    <>
      <PageHeader
        title="Customers"
        description="Every applicant, and the digital signals we can read about them. Most have no credit file at all — the profile is built entirely from wallet, top-up and bill payment behaviour."
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Customers' }]}
      />

      <div className="flex flex-col gap-6">
        <Suspense fallback={<CoverageSkeleton />}>
          <SignalCoverage />
        </Suspense>

        <Section title="Signal profiles">
          <Suspense fallback={<SkeletonTable rows={8} columns={7} />}>
            <CustomerList />
          </Suspense>
        </Section>
      </div>
    </>
  )
}

function CoverageSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <SkeletonStat key={i} />
      ))}
    </div>
  )
}

async function SignalCoverage() {
  // Only the await is inside the try. Returning JSX from a catch would not
  // actually catch a render error — React renders the element later, outside
  // this call stack — so the fetch and the rendering are kept separate.
  let coverage: Awaited<ReturnType<typeof getSignalCoverage>> | null = null
  let error: unknown = null
  try {
    coverage = await getSignalCoverage()
  } catch (err) {
    error = err
  }

  if (error || !coverage) {
    return (
      <Card>
        <ErrorState
          title="Could not read the signal layer"
          description="The database is unreachable, or the Phase 1 migration has not been applied."
          error={error}
        />
      </Card>
    )
  }

  if (coverage.customers === 0) {
    return (
      <Alert tone="info" icon={<Database />} title="No signal data loaded yet">
        Run <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">npm run db:migrate</code>{' '}
        then{' '}
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">npm run db:seed</code>{' '}
        and{' '}
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">npm run db:features</code>{' '}
        to load the synthetic Pakistani informal-worker population.
      </Alert>
    )
  }

  const thinFilePct = coverage.thinFileCustomers / coverage.customers

  const stats = [
    {
      icon: Users,
      label: 'Customers',
      value: formatNumber(coverage.customers),
      detail: `${formatPercent(thinFilePct, { decimals: 0 })} have no credit file`,
    },
    {
      icon: FileText,
      label: 'Wallet transactions',
      value: formatNumber(coverage.walletTransactions),
      detail:
        coverage.earliestSignal && coverage.latestSignal
          ? `${formatDate(coverage.earliestSignal)} → ${formatDate(coverage.latestSignal)}`
          : '—',
    },
    {
      icon: Receipt,
      label: 'Bill payments',
      value: formatNumber(coverage.billPayments),
      detail: `${formatPercent(coverage.avgBillPunctuality, { decimals: 0 })} paid on time on average`,
    },
    {
      icon: Smartphone,
      label: 'Mobile top-ups',
      value: formatNumber(coverage.topups),
      detail: `Average tenure ${Math.round(coverage.avgTenureMonths)} months`,
    },
  ]

  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon
          return (
            <Card key={stat.label}>
              <CardContent className="p-4 pt-4 sm:p-5 sm:pt-5">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                  <p className="truncate text-sm">{stat.label}</p>
                </div>
                <p className="mt-2 text-2xl font-semibold tabular-nums">{stat.value}</p>
                <p className="mt-1 text-xs leading-snug text-muted-foreground">{stat.detail}</p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {coverage.featuresBuilt < coverage.customers && (
        <Alert tone="warning" title="Features are out of date">
          {coverage.featuresBuilt} of {coverage.customers} customers have an engineered feature
          snapshot. Run{' '}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
            npm run db:features
          </code>{' '}
          to rebuild the rest.
        </Alert>
      )}

      <Alert tone="info" title="What a thin file looks like here">
        The average customer earns {formatPKR(coverage.avgMonthlyInflow)} a month and has{' '}
        {Math.round(coverage.avgTenureMonths)} months of wallet history — real, verifiable income a
        traditional underwriter would never see, because none of it appears as a payslip or a
        bureau record.
      </Alert>
    </>
  )
}

async function CustomerList() {
  let rows: Awaited<ReturnType<typeof listCustomers>>['rows'] | null = null
  let error: unknown = null
  try {
    rows = (await listCustomers({ limit: 300 })).rows
  } catch (err) {
    error = err
  }

  if (error || !rows) {
    return (
      <Card>
        <ErrorState
          title="Could not load customers"
          description="The query failed. Check that the Phase 1 migration has been applied."
          error={error}
        />
      </Card>
    )
  }

  return <CustomersTable customers={rows} />
}
