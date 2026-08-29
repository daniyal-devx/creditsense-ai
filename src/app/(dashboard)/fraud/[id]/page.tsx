import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Network, User } from 'lucide-react'
import { PageHeader, Section } from '@/components/layout/page-header'
import { FraudPanel } from '@/components/fraud/fraud-panel'
import { RelationshipGraphView } from '@/components/fraud/relationship-graph'
import { Alert } from '@/components/ui/alert'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeaderRow } from '@/components/ui/card'
import { requirePermission } from '@/lib/auth/guard'
import { getCustomer } from '@/lib/db/customers'
import { getClusterFor, getFraudAssessment, getNeighbourhoodGraph } from '@/lib/db/fraud'
import { formatDate, formatDateTime, maskCNIC, titleFromSlug } from '@/lib/utils/format'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const customer = await getCustomer(id)
  return { title: customer ? `Fraud review — ${customer.fullName}` : 'Fraud review' }
}

/**
 * The fraud investigation view.
 *
 * Phase 5's "done when": a Fraud Analyst opens a flagged applicant and can
 * visually trace the suspicious cluster around them. The graph is the point of
 * this page — everything else is context for reading it.
 */
export default async function FraudInvestigationPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission('fraud:read')

  const { id } = await params
  const customer = await getCustomer(id)
  if (!customer) notFound()

  const [assessment, cluster, graph] = await Promise.all([
    getFraudAssessment(id),
    getClusterFor(id),
    getNeighbourhoodGraph(id, 2),
  ])

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'FraudSense', href: '/fraud' },
          { label: customer.fullName },
        ]}
        title={
          <span className="flex items-center gap-3">
            <Avatar name={customer.fullName} size="lg" className="hidden sm:inline-flex" />
            <span>{customer.fullName}</span>
          </span>
        }
        description={`${customer.occupation} · ${customer.city}, ${customer.province}`}
        actions={
          <Link
            href={`/customers/${id}`}
            className={buttonVariants({ variant: 'secondary' })}
          >
            <User className="mr-2 size-4" aria-hidden="true" />
            Full applicant profile
          </Link>
        }
      />

      <div className="flex flex-col gap-6">
        {assessment ? (
          <FraudPanel assessment={assessment} customerName={customer.fullName}>
            {/* ---------- identity signals ---------- */}
            <Card>
              <CardHeaderRow
                title="Identity signals"
                description="The attributes a fabricated identity has trouble varying."
              />
              <CardContent>
                <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Detail label="CNIC" value={maskCNIC(customer.cnic)} mono />
                  <Detail label="Device fingerprint" value={customer.deviceFingerprint ?? '—'} mono />
                  <Detail label="Wallet opened" value={formatDate(customer.walletOpenedAt)} />
                  <Detail
                    label="SIM registered"
                    value={customer.simRegisteredAt ? formatDate(customer.simRegisteredAt) : '—'}
                  />
                  <Detail label="Address" value={customer.address ?? '—'} />
                  <Detail
                    label="Wallet tenure"
                    value={
                      customer.walletTenureMonths !== null
                        ? `${customer.walletTenureMonths} months`
                        : '—'
                    }
                  />
                </dl>
              </CardContent>
            </Card>
          </FraudPanel>
        ) : (
          <Alert tone="warning" title="Not assessed yet">
            No fraud assessment exists for this applicant. Run{' '}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
              npm run db:fraud
            </code>
            .
          </Alert>
        )}

        {/* ---------- the cluster ---------- */}
        {cluster && (
          <Section title="The cluster around them">
            <Card>
              <CardHeaderRow
                title={`${cluster.memberCount} connected applicants`}
                description={`Cohesion ${cluster.cohesion.toFixed(2)} · linked by ${cluster.linkTypes.map((t) => titleFromSlug(t).toLowerCase()).join(', ')}`}
                actions={
                  <Badge
                    tone={
                      cluster.severity === 'critical' || cluster.severity === 'high'
                        ? 'danger'
                        : cluster.severity === 'medium'
                          ? 'warning'
                          : 'neutral'
                    }
                  >
                    {cluster.severity}
                  </Badge>
                }
              />
              <CardContent>
                <p className="text-sm leading-relaxed">{cluster.assessment}</p>
                <p className="mt-3 text-xs text-muted-foreground">
                  Detected {formatDateTime(cluster.detectedAt)}
                  {cluster.reviewedAt
                    ? ` · reviewed ${formatDateTime(cluster.reviewedAt)}`
                    : ' · not yet reviewed'}
                </p>
              </CardContent>
            </Card>
          </Section>
        )}

        {/* ---------- the graph ---------- */}
        <Section
          title="Relationship graph"
          description="Everyone connected to this applicant, two hops out. Drag to pan, tap a node to focus it, or read the connections as a list below."
        >
          <Card>
            <CardContent className="p-4 sm:p-5">
              {graph.nodes.length <= 1 ? (
                <div className="flex flex-col items-center py-10 text-center">
                  <span className="mb-3 flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <Network className="size-6" aria-hidden="true" />
                  </span>
                  <p className="font-semibold">No connections found</p>
                  <p className="mt-1 max-w-sm text-sm leading-relaxed text-muted-foreground">
                    This applicant does not share a device, address or counterparty with anyone
                    else, and no money has moved between them and another applicant.
                  </p>
                </div>
              ) : (
                <RelationshipGraphView graph={graph} />
              )}
            </CardContent>
          </Card>
        </Section>
      </div>
    </>
  )
}

function Detail({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`mt-1 break-words text-sm font-medium ${mono ? 'font-mono text-xs' : ''}`}>
        {value}
      </dd>
    </div>
  )
}
