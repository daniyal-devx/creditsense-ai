import 'server-only'
import { query, queryOne, transaction } from './client'
import { recordAudit } from '@/lib/auth/audit'
import { getRiskBand, type RiskBand } from '@/lib/risk'
import type { Role } from '@/lib/auth/roles'

/**
 * The application queue and the decision workflow.
 *
 * This is where the four modules stop being separate analyses and become one
 * approve/reject. The queue row therefore carries all four answers — score,
 * affordability inputs, fraud level, and any monitoring alerts — because a
 * loan officer triaging fifty applications needs to see which ones are
 * straightforward without opening each one.
 */

export type ApplicationStatus = 'pending' | 'in_review' | 'approved' | 'rejected' | 'withdrawn'

export interface QueueApplication {
  id: string
  reference: string
  customerId: string
  fullName: string
  city: string
  occupation: string
  persona: string
  hasBankLoanHistory: boolean

  requestedAmount: number
  requestedTenorMonths: number
  purpose: string
  status: ApplicationStatus
  channel: string
  submittedAt: Date
  decidedAt: Date | null
  decidedByEmail: string | null
  decisionNotes: string | null

  score: number | null
  band: RiskBand | null

  fraudLevel: 'clear' | 'review' | 'investigate' | 'block' | null
  fraudScore: number | null

  openAlerts: number
  criticalAlerts: number

  /** Days the application has been waiting. */
  ageDays: number
}

function mapQueueRow(r: Record<string, unknown>): QueueApplication {
  const score = r.score === null || r.score === undefined ? null : Number(r.score)
  return {
    id: r.id as string,
    reference: r.reference as string,
    customerId: r.customer_id as string,
    fullName: r.full_name as string,
    city: r.city as string,
    occupation: r.occupation as string,
    persona: r.persona as string,
    hasBankLoanHistory: r.has_bank_loan_history as boolean,
    requestedAmount: Number(r.requested_amount),
    requestedTenorMonths: Number(r.requested_tenor_months),
    purpose: r.purpose as string,
    status: r.status as ApplicationStatus,
    channel: r.channel as string,
    submittedAt: r.submitted_at as Date,
    decidedAt: (r.decided_at as Date | null) ?? null,
    decidedByEmail: (r.decided_by_email as string | null) ?? null,
    decisionNotes: (r.decision_notes as string | null) ?? null,
    score,
    band: score === null ? null : getRiskBand(score),
    fraudLevel: (r.fraud_level as QueueApplication['fraudLevel']) ?? null,
    fraudScore: r.fraud_score === null || r.fraud_score === undefined ? null : Number(r.fraud_score),
    openAlerts: Number(r.open_alerts ?? 0),
    criticalAlerts: Number(r.critical_alerts ?? 0),
    ageDays: Number(r.age_days ?? 0),
  }
}

const QUEUE_SELECT = `
  select
    a.id, a.reference, a.customer_id, a.requested_amount, a.requested_tenor_months,
    a.purpose, a.status, a.channel, a.submitted_at, a.decided_at, a.decision_notes,
    c.full_name, c.city, c.occupation, c.persona, c.has_bank_loan_history,
    s.score,
    f.level as fraud_level, f.risk_score as fraud_score,
    u.email as decided_by_email,
    (select count(*) from monitoring_alerts m
      where m.customer_id = c.id and m.status = 'open') as open_alerts,
    (select count(*) from monitoring_alerts m
      where m.customer_id = c.id and m.status = 'open' and m.severity = 'critical') as critical_alerts,
    extract(day from now() - a.submitted_at)::int as age_days
  from applications a
  join customers c on c.id = a.customer_id
  left join current_credit_scores s on s.customer_id = c.id
  left join current_fraud_assessments f on f.customer_id = c.id
  left join users u on u.id = a.decided_by
`

export interface QueueFilters {
  status?: ApplicationStatus | 'open'
  limit?: number
}

export async function getApplicationQueue(
  filters: QueueFilters = {},
): Promise<QueueApplication[]> {
  const { status = 'open', limit = 200 } = filters

  const where =
    status === 'open'
      ? `where a.status in ('pending', 'in_review')`
      : `where a.status = '${status.replace(/'/g, '')}'`

  const rows = await query<Record<string, unknown>>(
    `${QUEUE_SELECT}
     ${where}
     order by
       -- Anything the fraud engine says to hold goes to the top: deciding one
       -- of those by mistake is the most expensive error available here.
       case f.level when 'block' then 0 when 'investigate' then 1 else 2 end,
       a.submitted_at
     limit $1`,
    [limit],
  )

  return rows.map(mapQueueRow)
}

export async function getApplication(id: string): Promise<QueueApplication | null> {
  const row = await queryOne<Record<string, unknown>>(`${QUEUE_SELECT} where a.id = $1`, [id])
  return row ? mapQueueRow(row) : null
}

/** Applications for one customer, newest first. */
export async function getApplicationsForCustomer(customerId: string): Promise<QueueApplication[]> {
  const rows = await query<Record<string, unknown>>(
    `${QUEUE_SELECT} where a.customer_id = $1 order by a.submitted_at desc`,
    [customerId],
  )
  return rows.map(mapQueueRow)
}

export interface QueueStats {
  pending: number
  inReview: number
  approvedToday: number
  rejectedToday: number
  blockedByFraud: number
  oldestPendingDays: number
  totalRequested: number
}

export async function getQueueStats(): Promise<QueueStats> {
  const r = await queryOne<Record<string, unknown>>(`
    select
      count(*) filter (where a.status = 'pending')::text                          as pending,
      count(*) filter (where a.status = 'in_review')::text                        as in_review,
      count(*) filter (where a.status = 'approved'
                         and a.decided_at::date = current_date)::text             as approved_today,
      count(*) filter (where a.status = 'rejected'
                         and a.decided_at::date = current_date)::text             as rejected_today,
      count(*) filter (where a.status in ('pending','in_review')
                         and f.level = 'block')::text                             as blocked_by_fraud,
      coalesce(max(extract(day from now() - a.submitted_at)) filter
        (where a.status = 'pending'), 0)::text                                    as oldest_pending_days,
      coalesce(sum(a.requested_amount) filter
        (where a.status in ('pending','in_review')), 0)::text                     as total_requested
    from applications a
    left join current_fraud_assessments f on f.customer_id = a.customer_id
  `)

  return {
    pending: Number(r?.pending ?? 0),
    inReview: Number(r?.in_review ?? 0),
    approvedToday: Number(r?.approved_today ?? 0),
    rejectedToday: Number(r?.rejected_today ?? 0),
    blockedByFraud: Number(r?.blocked_by_fraud ?? 0),
    oldestPendingDays: Number(r?.oldest_pending_days ?? 0),
    totalRequested: Number(r?.total_requested ?? 0),
  }
}

// ---------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------

export type DecisionAction = 'approve' | 'reject' | 'send_to_review'

export interface DecisionInput {
  applicationId: string
  action: DecisionAction
  /** Required. The reasoning is the point of the audit trail. */
  reasoning: string
  /** For an approval that differs from what was requested. */
  approvedAmount?: number
  approvedTenorMonths?: number
  actor: { id: string; email: string; role: Role }
  context: { ipAddress: string | null; userAgent: string | null }
  /** The evidence the officer saw, captured with the decision. */
  evidence?: {
    score?: number | null
    band?: string | null
    fraudLevel?: string | null
    recommendedAmount?: number | null
  }
}

export type DecisionResult =
  | { ok: true; status: ApplicationStatus; loanReference?: string }
  | { ok: false; error: string }

/**
 * Record a decision.
 *
 * Everything happens in one transaction: the application status, the loan and
 * its instalment schedule when approved, and the audit entry. A half-applied
 * decision — an approved application with no loan, or a loan with no audit
 * trail — is worse than a failed one, because it looks correct.
 */
export async function decideApplication(input: DecisionInput): Promise<DecisionResult> {
  const { applicationId, action, reasoning, actor, context } = input

  if (reasoning.trim().length < 10) {
    return { ok: false, error: 'Record your reasoning — at least a sentence.' }
  }

  const application = await getApplication(applicationId)
  if (!application) return { ok: false, error: 'That application no longer exists.' }

  if (application.status !== 'pending' && application.status !== 'in_review') {
    return {
      ok: false,
      error: `This application was already ${application.status}. It cannot be decided again.`,
    }
  }

  // FraudSense saying "block" means exactly that. Letting an officer approve
  // through it would make the fraud engine advisory, which is not what "do not
  // decide without review" means.
  if (action === 'approve' && application.fraudLevel === 'block') {
    return {
      ok: false,
      error:
        'FraudSense has flagged this application for mandatory review. A Fraud Analyst must clear it before it can be approved.',
    }
  }

  const nextStatus: ApplicationStatus =
    action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'in_review'

  const approvedAmount = input.approvedAmount ?? application.requestedAmount
  const approvedTenor = input.approvedTenorMonths ?? application.requestedTenorMonths

  let loanReference: string | undefined

  try {
    await transaction(async (tx) => {
      await tx.query(
        `update applications
            set status = $2,
                decided_at = case when $2 in ('approved','rejected') then now() else null end,
                decided_by = case when $2 in ('approved','rejected') then $3::uuid else null end,
                decision_notes = $4
          where id = $1`,
        [applicationId, nextStatus, actor.id, reasoning.trim()],
      )

      if (action === 'approve') {
        // Rate by band, matching the affordability engine's pricing.
        const rateByBand: Record<string, number> = {
          'very-low': 0.24,
          low: 0.28,
          moderate: 0.34,
          high: 0.42,
          'very-high': 0.48,
        }
        const annualRate = rateByBand[application.band?.id ?? 'moderate'] ?? 0.34
        const totalRepayable = approvedAmount * (1 + (annualRate * approvedTenor) / 12)
        const instalment = Math.round(totalRepayable / approvedTenor / 10) * 10

        // Dates are computed in JS rather than in SQL. An earlier version
        // passed the tenor as one parameter used both as an integer column and
        // inside `($4 || ' months')::interval`, and Postgres refused it with
        // "inconsistent types deduced for parameter $4" — it cannot deduce one
        // type for a parameter used as both an integer and text.
        const disbursedAt = new Date()
        const firstDue = new Date(disbursedAt)
        firstDue.setMonth(firstDue.getMonth() + 1)
        const maturity = new Date(disbursedAt)
        maturity.setMonth(maturity.getMonth() + approvedTenor)

        const asDate = (d: Date) => d.toISOString().slice(0, 10)

        const { rows } = await tx.query<{ id: string; reference: string }>(
          `insert into loans
             (customer_id, application_id, reference, principal, tenor_months, annual_rate,
              instalment_amount, disbursed_at, first_due_date, maturity_date, status,
              outstanding_balance)
           values ($1, $2,
                   'LN-' || to_char(now(), 'YYYY') || '-' ||
                     lpad((coalesce((select count(*) from loans), 0) + 1)::text, 5, '0'),
                   $3, $4, $5, $6, $7, $8, $9, 'active', $10)
           returning id, reference`,
          [
            application.customerId,
            applicationId,
            approvedAmount,
            approvedTenor,
            annualRate.toFixed(4),
            instalment,
            disbursedAt,
            asDate(firstDue),
            asDate(maturity),
            Math.round(totalRepayable),
          ],
        )

        const loanId = rows[0]?.id
        loanReference = rows[0]?.reference
        if (!loanId) throw new Error('Loan insert returned no id')

        // The instalment schedule, so monitoring has something to watch from
        // day one rather than waiting for the first payment to be recorded.
        // The loan id comes from RETURNING and is passed as a parameter — the
        // earlier version interpolated the application id straight into the
        // SQL text, which is a habit worth not having anywhere near a lender.
        const scheduleTuples: string[] = []
        const scheduleParams: unknown[] = [loanId, application.customerId, instalment]

        for (let i = 1; i <= approvedTenor; i++) {
          const due = new Date(disbursedAt)
          due.setMonth(due.getMonth() + i)
          scheduleParams.push(i, asDate(due))
          scheduleTuples.push(
            `($1, $2, $${scheduleParams.length - 1}, $${scheduleParams.length}, $3, 'due')`,
          )
        }

        await tx.query(
          `insert into repayments (loan_id, customer_id, instalment_no, due_date, amount_due, status)
           values ${scheduleTuples.join(', ')}`,
          scheduleParams,
        )
      }
    })
  } catch (err) {
    console.error('[decision] failed:', err)
    return { ok: false, error: 'Could not record the decision. Nothing was changed.' }
  }

  await recordAudit({
    actor: { id: actor.id, email: actor.email, role: actor.role },
    action:
      action === 'approve'
        ? 'application.approved'
        : action === 'reject'
          ? 'application.rejected'
          : 'application.sent_to_review',
    entityType: 'application',
    entityId: applicationId,
    details: {
      reference: application.reference,
      customer: application.fullName,
      requestedAmount: application.requestedAmount,
      ...(action === 'approve' ? { approvedAmount, approvedTenor, loanReference } : {}),
      reasoning: reasoning.trim(),
      // The evidence in front of the officer at the time. Without this the
      // audit trail records what was decided but not what it was decided on,
      // and the two are equally necessary to defend it later.
      scoreAtDecision: input.evidence?.score ?? application.score,
      bandAtDecision: input.evidence?.band ?? application.band?.id ?? null,
      fraudLevelAtDecision: input.evidence?.fraudLevel ?? application.fraudLevel,
      systemRecommendedAmount: input.evidence?.recommendedAmount ?? null,
    },
    ...context,
  })

  return { ok: true, status: nextStatus, loanReference }
}
