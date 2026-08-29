/**
 * Phase 7's "done when", exercised for real:
 * the complete journey — applicant in, decision out — end to end.
 *
 *   node scripts/test/decision-e2e.mjs http://localhost:3700
 */
import pg from 'pg'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local', quiet: true })

const BASE = process.argv[2] ?? 'http://localhost:3700'
const db = new pg.Client({
  connectionString: process.env.DIRECT_URL,
  ssl: { rejectUnauthorized: false },
})

let passed = 0
let failed = 0

function check(name, ok, detail = '') {
  if (ok) {
    passed++
    console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ''}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

function makeJar() {
  const jar = new Map()
  return {
    header: () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; '),
    absorb: (res) => {
      for (const raw of res.headers.getSetCookie?.() ?? []) {
        const [pair] = raw.split(';')
        const i = pair.indexOf('=')
        const name = pair.slice(0, i).trim()
        const value = pair.slice(i + 1).trim()
        if (value === '') jar.delete(name)
        else jar.set(name, value)
      }
    },
  }
}

async function call(path, { method = 'GET', body, jar, redirect = 'manual' } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    redirect,
    headers: {
      'Content-Type': 'application/json',
      ...(jar ? { Cookie: jar.header() } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  jar?.absorb(res)
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {}
  return { status: res.status, json, text, headers: res.headers }
}

async function signIn(email) {
  const jar = makeJar()
  await call('/api/auth/login', {
    method: 'POST',
    body: { email, password: 'CreditSense2026!' },
    jar,
  })
  return jar
}

async function main() {
  await db.connect()
  console.log(`\n  Decision workflow end to end against ${BASE}\n  ${'─'.repeat(64)}`)

  const officer = await signIn('officer@creditsense.pk')
  const analyst = await signIn('risk@creditsense.pk')

  // ---------- pick a clean pending application ----------
  const { rows: candidates } = await db.query(`
    select a.id, a.reference, a.requested_amount, c.full_name, s.score, f.level as fraud_level
      from applications a
      join customers c on c.id = a.customer_id
      left join current_credit_scores s on s.customer_id = c.id
      left join current_fraud_assessments f on f.customer_id = c.id
     where a.status = 'pending'
       and (f.level is null or f.level = 'clear')
       and s.score is not null
     order by s.score desc
     limit 1
  `)
  check('found a clean pending application to decide', candidates.length === 1)
  if (candidates.length === 0) {
    await db.end()
    process.exit(1)
  }
  const app = candidates[0]
  console.log(`        ${app.reference} — ${app.full_name}, score ${app.score}\n`)

  // ---------- the queue and the decision page load ----------
  const queue = await call('/applications', { jar: officer })
  check('loan officer can open the queue', queue.status === 200)
  check('queue shows the application', queue.text.includes(app.full_name))

  const page = await call(`/applications/${app.id}`, { jar: officer })
  check('decision page loads', page.status === 200)

  const stripped = page.text.replace(/<[^>]*>/g, ' ')
  check('all four modules present on one page',
    stripped.includes('CreditSense Score') &&
    stripped.includes('Safe loan amount') &&
    (stripped.includes('Nothing flagged') || stripped.includes('fraud')) &&
    stripped.includes('bill'),
  )

  // ---------- reasoning is mandatory ----------
  const noReason = await call(`/api/applications/${app.id}/decide`, {
    method: 'POST',
    body: { action: 'approve', reasoning: 'ok' },
    jar: officer,
  })
  check('a decision without real reasoning is refused', noReason.status === 400, `status ${noReason.status} :: ${noReason.json?.error ?? noReason.text.slice(0,120)}`)

  // ---------- role separation ----------
  const analystTry = await call(`/api/applications/${app.id}/decide`, {
    method: 'POST',
    body: { action: 'approve', reasoning: 'Risk analyst should not be able to do this at all.' },
    jar: analyst,
  })
  check('risk analyst is refused with 403', analystTry.status === 403, `status ${analystTry.status} :: ${analystTry.json?.error ?? analystTry.text.slice(0,120)}`)

  const analystRead = await call(`/applications/${app.id}`, { jar: analyst })
  check('risk analyst can still READ the application', analystRead.status === 200)
  check(
    'read-only notice shown instead of the action bar',
    analystRead.text.includes('cannot approve or reject'),
  )

  // ---------- fraud block is enforced ----------
  const { rows: blocked } = await db.query(`
    select a.id, c.full_name from applications a
      join customers c on c.id = a.customer_id
      join current_fraud_assessments f on f.customer_id = c.id
     where a.status in ('pending','in_review') and f.level = 'block'
     limit 1
  `)
  if (blocked.length > 0) {
    const attempt = await call(`/api/applications/${blocked[0].id}/decide`, {
      method: 'POST',
      body: {
        action: 'approve',
        reasoning: 'Attempting to approve an application FraudSense has held for review.',
      },
      jar: officer,
    })
    check(
      'FraudSense block prevents approval (409)',
      attempt.status === 409 && /fraud/i.test(attempt.json?.error ?? ''),
      attempt.json?.error,
    )

    const reject = await call(`/api/applications/${blocked[0].id}/decide`, {
      method: 'POST',
      body: {
        action: 'send_to_review',
        reasoning: 'Held by FraudSense — sending to manual review for a fraud analyst to clear.',
      },
      jar: officer,
    })
    check('a held application can still be sent to review', reject.status === 200)
  } else {
    console.log('  SKIP  no fraud-blocked application in the queue')
  }

  // ---------- approve for real ----------
  const beforeLoans = await db.query('select count(*)::int as n from loans')

  const approve = await call(`/api/applications/${app.id}/decide`, {
    method: 'POST',
    body: {
      action: 'approve',
      reasoning:
        'Strong bill payment record and stable income over a long wallet history. The instalment sits well inside the affordability ceiling.',
      approvedAmount: 40000,
      approvedTenorMonths: 12,
      evidence: { score: app.score, band: 'low', fraudLevel: 'clear', recommendedAmount: 50000 },
    },
    jar: officer,
  })
  check('approval succeeds', approve.status === 200, approve.json?.error ?? `loan ${approve.json?.loanReference}`)

  // ---------- everything it should have done ----------
  const { rows: after } = await db.query(
    'select status, decided_at, decided_by, decision_notes from applications where id = $1',
    [app.id],
  )
  check('application marked approved', after[0]?.status === 'approved')
  check('decision timestamped', after[0]?.decided_at !== null)
  check('decider recorded', after[0]?.decided_by !== null)
  check('reasoning stored', (after[0]?.decision_notes ?? '').length > 20)

  const afterLoans = await db.query('select count(*)::int as n from loans')
  check('a loan was created', afterLoans.rows[0].n === beforeLoans.rows[0].n + 1)

  const { rows: loan } = await db.query(
    'select id, principal, tenor_months, instalment_amount, status from loans where application_id = $1',
    [app.id],
  )
  check('loan has the approved amount', Number(loan[0]?.principal) === 40000, `Rs ${loan[0]?.principal}`)
  check('loan has the approved term', loan[0]?.tenor_months === 12)
  check('loan is active', loan[0]?.status === 'active')

  const { rows: schedule } = await db.query(
    'select count(*)::int as n from repayments where loan_id = $1',
    [loan[0]?.id],
  )
  check('instalment schedule created', schedule[0]?.n === 12, `${schedule[0]?.n} instalments`)

  // ---------- the audit trail ----------
  const { rows: audit } = await db.query(
    `select action, actor_email, details from audit_log
      where entity_id = $1 and action = 'application.approved'
      order by created_at desc limit 1`,
    [app.id],
  )
  check('approval was audited', audit.length === 1)
  check('audit names the decider', audit[0]?.actor_email === 'officer@creditsense.pk')
  check('audit stores the reasoning', String(audit[0]?.details?.reasoning ?? '').length > 20)
  check(
    'audit stores the EVIDENCE the officer saw',
    audit[0]?.details?.scoreAtDecision !== undefined &&
      audit[0]?.details?.fraudLevelAtDecision !== undefined,
    `score ${audit[0]?.details?.scoreAtDecision}, fraud ${audit[0]?.details?.fraudLevelAtDecision}`,
  )
  check(
    'audit records that the officer lent below the recommendation',
    Number(audit[0]?.details?.approvedAmount) === 40000 &&
      Number(audit[0]?.details?.systemRecommendedAmount) === 50000,
  )

  // ---------- cannot decide twice ----------
  const again = await call(`/api/applications/${app.id}/decide`, {
    method: 'POST',
    body: { action: 'reject', reasoning: 'Trying to decide an already-decided application.' },
    jar: officer,
  })
  check('a decided application cannot be decided again', again.status === 409, again.json?.error)

  // ---------- it shows as decided ----------
  const decidedPage = await call(`/applications/${app.id}`, { jar: officer })
  check(
    'page now shows the decision and who made it',
    decidedPage.text.includes('Already approved') &&
      decidedPage.text.includes('officer@creditsense.pk'),
  )

  // ---------- audit trail is visible to an admin ----------
  const admin = await signIn('admin@creditsense.pk')
  const auditPage = await call('/audit', { jar: admin })
  check('admin can read the audit trail', auditPage.status === 200)
  check('audit page shows the approval', auditPage.text.includes('Approved an application'))

  const officerAudit = await call('/audit', { jar: officer })
  check(
    'loan officer cannot read the audit trail',
    officerAudit.status === 307 && (officerAudit.headers.get('location') ?? '').includes('/no-access'),
    `status ${officerAudit.status}`,
  )

  console.log(`  ${'─'.repeat(64)}`)
  console.log(`  ${passed} passed, ${failed} failed\n`)

  await db.end()
  process.exit(failed > 0 ? 1 : 0)
}

main().catch(async (err) => {
  console.error('\n  Harness error:', err)
  try {
    await db.end()
  } catch {}
  process.exit(1)
})
