import 'server-only'
import { query, queryOne } from './client'
import type { FraudFlag } from '@/lib/fraud/detectors'
import { buildRelationshipGraph, type RelationshipGraph } from '@/lib/fraud/graph'

/** Reads for the FraudSense surfaces. */

export interface StoredFraudAssessment {
  assessmentId: string
  customerId: string
  riskScore: number
  level: 'clear' | 'review' | 'investigate' | 'block'
  flags: FraudFlag[]
  flagCodes: string[]
  summary: string
  assessedAt: Date
}

function mapAssessment(r: Record<string, unknown>): StoredFraudAssessment {
  return {
    assessmentId: (r.assessment_id ?? r.id) as string,
    customerId: r.customer_id as string,
    riskScore: Number(r.risk_score),
    level: r.level as StoredFraudAssessment['level'],
    flags: (r.flags as FraudFlag[]) ?? [],
    flagCodes: (r.flag_codes as string[]) ?? [],
    summary: r.summary as string,
    assessedAt: r.assessed_at as Date,
  }
}

export async function getFraudAssessment(
  customerId: string,
): Promise<StoredFraudAssessment | null> {
  const row = await queryOne<Record<string, unknown>>(
    'select * from current_fraud_assessments where customer_id = $1',
    [customerId],
  )
  return row ? mapAssessment(row) : null
}

export async function getFraudAssessments(
  customerIds: string[],
): Promise<Map<string, StoredFraudAssessment>> {
  if (customerIds.length === 0) return new Map()
  const rows = await query<Record<string, unknown>>(
    'select * from current_fraud_assessments where customer_id = any($1::uuid[])',
    [customerIds],
  )
  return new Map(rows.map((r) => [r.customer_id as string, mapAssessment(r)]))
}

export interface FraudQueueRow {
  customerId: string
  fullName: string
  city: string
  persona: string
  fraudScore: number
  fraudLevel: 'review' | 'investigate' | 'block'
  flagCodes: string[]
  fraudSummary: string
  assessedAt: Date
  creditScore: number | null
  riskBand: string | null
  openApplications: number
  clusterCount: number
}

/** The Fraud Analyst's queue: everything above "clear", worst first. */
export async function getFraudQueue(limit = 200): Promise<FraudQueueRow[]> {
  const rows = await query<Record<string, unknown>>('select * from fraud_queue limit $1', [limit])

  return rows.map((r) => ({
    customerId: r.customer_id as string,
    fullName: r.full_name as string,
    city: r.city as string,
    persona: r.persona as string,
    fraudScore: Number(r.fraud_score),
    fraudLevel: r.fraud_level as FraudQueueRow['fraudLevel'],
    flagCodes: (r.flag_codes as string[]) ?? [],
    fraudSummary: r.fraud_summary as string,
    assessedAt: r.assessed_at as Date,
    creditScore: r.credit_score === null ? null : Number(r.credit_score),
    riskBand: (r.risk_band as string | null) ?? null,
    openApplications: Number(r.open_applications ?? 0),
    clusterCount: Number(r.cluster_count ?? 0),
  }))
}

export interface StoredCluster {
  id: string
  label: string
  customerIds: string[]
  memberCount: number
  cohesion: number
  linkTypes: string[]
  severity: 'critical' | 'high' | 'medium' | 'low'
  assessment: string
  reviewedAt: Date | null
  verdict: string | null
  detectedAt: Date
  /** Names, resolved for display. */
  members: { id: string; fullName: string; fraudScore: number | null; creditScore: number | null }[]
}

export async function getClusters(): Promise<StoredCluster[]> {
  const rows = await query<Record<string, unknown>>(
    `select fc.*,
            coalesce(
              (select json_agg(json_build_object(
                 'id', c.id,
                 'fullName', c.full_name,
                 'fraudScore', f.risk_score,
                 'creditScore', s.score
               ) order by f.risk_score desc nulls last)
                 from customers c
                 left join current_fraud_assessments f on f.customer_id = c.id
                 left join current_credit_scores s on s.customer_id = c.id
                where c.id = any(fc.customer_ids)),
              '[]'::json
            ) as members
       from fraud_clusters fc
      order by
        case severity when 'critical' then 0 when 'high' then 1 when 'medium' then 2 else 3 end,
        member_count desc`,
  )

  return rows.map((r) => ({
    id: r.id as string,
    label: r.label as string,
    customerIds: (r.customer_ids as string[]) ?? [],
    memberCount: Number(r.member_count),
    cohesion: Number(r.cohesion),
    linkTypes: (r.link_types as string[]) ?? [],
    severity: r.severity as StoredCluster['severity'],
    assessment: r.assessment as string,
    reviewedAt: (r.reviewed_at as Date | null) ?? null,
    verdict: (r.verdict as string | null) ?? null,
    detectedAt: r.detected_at as Date,
    members: (r.members as StoredCluster['members']) ?? [],
  }))
}

export async function getClusterFor(customerId: string): Promise<StoredCluster | null> {
  const clusters = await getClusters()
  return clusters.find((c) => c.customerIds.includes(customerId)) ?? null
}

/**
 * The relationship graph around one applicant.
 *
 * Only the neighbourhood is loaded, not the whole portfolio. A 328-node graph
 * is unreadable and slow to render, and an analyst investigating one person
 * needs the people connected to them, not everybody.
 */
export async function getNeighbourhoodGraph(
  customerId: string,
  depth = 2,
): Promise<RelationshipGraph> {
  // Walk the stored links outward from the focus, `depth` hops at a time.
  const rows = await query<{
    customer_a: string
    customer_b: string
    link_type: string
    weight: string
    shared_value: string | null
    detail: Record<string, unknown>
  }>(
    `with recursive neighbourhood as (
       select $1::uuid as id, 0 as depth
       union
       select case when l.customer_a = n.id then l.customer_b else l.customer_a end, n.depth + 1
         from neighbourhood n
         join fraud_links l on l.customer_a = n.id or l.customer_b = n.id
        where n.depth < $2
     )
     select distinct l.customer_a, l.customer_b, l.link_type, l.weight, l.shared_value, l.detail
       from fraud_links l
      where l.customer_a in (select id from neighbourhood)
        and l.customer_b in (select id from neighbourhood)`,
    [customerId, depth],
  )

  const involved = new Set<string>([customerId])
  for (const row of rows) {
    involved.add(row.customer_a)
    involved.add(row.customer_b)
  }

  const applicants = await query<{
    id: string
    full_name: string
    city: string
    device_fingerprint: string | null
    address: string | null
    phone: string
    fraud_score: number | null
    credit_score: number | null
  }>(
    `select c.id, c.full_name, c.city, c.device_fingerprint, c.address, c.phone,
            f.risk_score as fraud_score, s.score as credit_score
       from customers c
       left join current_fraud_assessments f on f.customer_id = c.id
       left join current_credit_scores s on s.customer_id = c.id
      where c.id = any($1::uuid[])`,
    [[...involved]],
  )

  // The stored links already encode every relationship, so the graph builder
  // is fed those directly rather than re-deriving them from raw signals.
  const transfers = rows
    .filter((r) => r.link_type === 'money_transfer')
    .map((r) => ({
      fromCustomerId: r.customer_a,
      toCustomerId: r.customer_b,
      count: 1,
      total: 0,
    }))

  const sharedCounterparties = rows
    .filter((r) => r.link_type === 'counterparty' && r.shared_value)
    .map((r) => ({ ref: r.shared_value!, customerIds: [r.customer_a, r.customer_b] }))

  return buildRelationshipGraph({
    applicants: applicants.map((a) => ({
      id: a.id,
      fullName: a.full_name,
      city: a.city,
      deviceFingerprint: a.device_fingerprint,
      address: a.address,
      phone: a.phone,
      riskScore: a.fraud_score === null ? undefined : Number(a.fraud_score),
      creditScore: a.credit_score === null ? undefined : Number(a.credit_score),
    })),
    transfers,
    sharedCounterparties,
    focusCustomerId: customerId,
  })
}

export interface FraudStats {
  assessed: number
  block: number
  investigate: number
  review: number
  clear: number
  clusters: number
  unreviewedClusters: number
  linkedApplicants: number
}

export async function getFraudStats(): Promise<FraudStats> {
  const row = await queryOne<Record<string, unknown>>(`
    select
      (select count(*) from current_fraud_assessments)::text                              as assessed,
      (select count(*) from current_fraud_assessments where level = 'block')::text        as block,
      (select count(*) from current_fraud_assessments where level = 'investigate')::text  as investigate,
      (select count(*) from current_fraud_assessments where level = 'review')::text       as review,
      (select count(*) from current_fraud_assessments where level = 'clear')::text        as clear,
      (select count(*) from fraud_clusters)::text                                         as clusters,
      (select count(*) from fraud_clusters where reviewed_at is null)::text               as unreviewed,
      (select count(distinct customer_a) + count(distinct customer_b) from fraud_links)::text as linked
  `)

  return {
    assessed: Number(row?.assessed ?? 0),
    block: Number(row?.block ?? 0),
    investigate: Number(row?.investigate ?? 0),
    review: Number(row?.review ?? 0),
    clear: Number(row?.clear ?? 0),
    clusters: Number(row?.clusters ?? 0),
    unreviewedClusters: Number(row?.unreviewed ?? 0),
    linkedApplicants: Number(row?.linked ?? 0),
  }
}
