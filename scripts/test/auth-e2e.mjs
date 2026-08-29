/**
 * End-to-end exercise of the Phase 2 auth flows against the running app and
 * the real database. Not a test framework — just an honest walk through every
 * path, so "it builds" is not mistaken for "it works".
 */
import pg from 'pg'
import dotenv from 'dotenv'
import { createHash } from 'node:crypto'

dotenv.config({ path: '.env.local', quiet: true })

const BASE = process.argv[2] ?? 'http://localhost:3200'
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

/** Minimal cookie jar — enough to carry the session between requests. */
function makeJar() {
  const jar = new Map()
  return {
    header: () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; '),
    absorb: (response) => {
      for (const raw of response.headers.getSetCookie?.() ?? []) {
        const [pair] = raw.split(';')
        const idx = pair.indexOf('=')
        const name = pair.slice(0, idx).trim()
        const value = pair.slice(idx + 1).trim()
        if (value === '') jar.delete(name)
        else jar.set(name, value)
      }
    },
  }
}

async function call(path, { method = 'GET', body, jar, redirect = 'manual' } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    redirect,
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'creditsense-e2e/1.0',
      ...(jar ? { Cookie: jar.header() } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  jar?.absorb(response)
  const text = await response.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    /* HTML response */
  }
  return { status: response.status, json, text, headers: response.headers }
}

const EMAIL = `e2e.${Date.now()}@creditsense.test`
const PASSWORD = 'CorrectHorseBattery9'

async function main() {
  await db.connect()
  console.log(`\n  Auth end-to-end against ${BASE}\n  ${'─'.repeat(62)}`)

  // ---------- signup ----------
  const jar = makeJar()
  const weak = await call('/api/auth/signup', {
    method: 'POST',
    body: { fullName: 'E2E Tester', email: EMAIL, password: 'short' },
  })
  check('weak password is rejected', weak.status === 400, weak.json?.error)

  const signup = await call('/api/auth/signup', {
    method: 'POST',
    body: { fullName: 'E2E Tester', email: EMAIL, password: PASSWORD },
    jar,
  })
  check('signup succeeds', signup.status === 201, `status ${signup.status}`)

  const created = await db.query(
    'select id, status, password_hash, email_normalised from users where email_normalised = $1',
    [EMAIL],
  )
  check('user row created', created.rows.length === 1)
  check('account starts unverified', created.rows[0]?.status === 'unverified')
  check(
    'password is bcrypt-hashed, not stored in plain text',
    created.rows[0]?.password_hash?.startsWith('$2') && !created.rows[0]?.password_hash?.includes(PASSWORD),
  )

  // ---------- enumeration resistance ----------
  const dup = await call('/api/auth/signup', {
    method: 'POST',
    body: { fullName: 'Someone Else', email: EMAIL, password: PASSWORD },
  })
  check(
    'duplicate signup does not reveal the account exists',
    dup.status === 201 && !JSON.stringify(dup.json).toLowerCase().includes('already'),
    `status ${dup.status}`,
  )

  // ---------- unverified cannot log in ----------
  const earlyLogin = await call('/api/auth/login', {
    method: 'POST',
    body: { email: EMAIL, password: PASSWORD },
  })
  check(
    'unverified login is redirected to verification, not signed in',
    earlyLogin.json?.needsVerification === true,
  )

  // ---------- verification code ----------
  const codeRow = await db.query(
    `select id, code_hash, expires_at, attempts from verification_codes
      where user_id = $1 and purpose = 'email_verification' and consumed_at is null
      order by created_at desc limit 1`,
    [created.rows[0].id],
  )
  check('a verification code was issued', codeRow.rows.length === 1)
  check(
    'code is stored hashed, never in plain text',
    /^[0-9a-f]{64}$/.test(codeRow.rows[0]?.code_hash ?? ''),
  )

  // Brute-force the 6-digit space against the stored hash — this is only
  // possible here because we are the ones who own the database.
  let realCode = null
  const targetHash = codeRow.rows[0].code_hash
  for (let i = 0; i < 1_000_000; i++) {
    const candidate = String(i).padStart(6, '0')
    if (createHash('sha256').update(candidate).digest('hex') === targetHash) {
      realCode = candidate
      break
    }
  }
  check('recovered the issued code from its hash (test harness only)', realCode !== null)

  const wrongCode = realCode === '000000' ? '999999' : '000000'
  const badVerify = await call('/api/auth/verify', {
    method: 'POST',
    body: { email: EMAIL, code: wrongCode },
  })
  check('wrong code is rejected', badVerify.status === 400, badVerify.json?.error)

  const attemptsAfter = await db.query('select attempts from verification_codes where id = $1', [
    codeRow.rows[0].id,
  ])
  check('failed attempt is counted', Number(attemptsAfter.rows[0]?.attempts) === 1)

  const verify = await call('/api/auth/verify', {
    method: 'POST',
    body: { email: EMAIL, code: realCode },
    jar,
  })
  check('correct code verifies the account', verify.status === 200, verify.json?.error ?? '')
  check('verification issues a session cookie', jar.header().includes('creditsense_session'))

  const afterVerify = await db.query('select status, email_verified_at from users where id = $1', [
    created.rows[0].id,
  ])
  check('account is now active', afterVerify.rows[0]?.status === 'active')
  check('verification timestamp recorded', afterVerify.rows[0]?.email_verified_at !== null)

  const consumed = await db.query('select consumed_at from verification_codes where id = $1', [
    codeRow.rows[0].id,
  ])
  check('code is consumed and cannot be reused', consumed.rows[0]?.consumed_at !== null)

  const replay = await call('/api/auth/verify', {
    method: 'POST',
    body: { email: EMAIL, code: realCode },
  })
  check('replaying a used code fails', replay.status === 400)

  // ---------- session ----------
  const me = await call('/api/auth/me', { jar })
  check('authenticated /api/auth/me returns the user', me.status === 200 && me.json?.user?.email)
  check('session response never contains a password hash', !me.text.includes('$2'))

  const sessionRow = await db.query(
    'select token_hash from sessions where user_id = $1 and revoked_at is null',
    [created.rows[0].id],
  )
  check(
    'session token is stored hashed, not as the raw cookie value',
    /^[0-9a-f]{64}$/.test(sessionRow.rows[0]?.token_hash ?? ''),
  )

  // ---------- protected routes ----------
  const anon = await call('/api/auth/me')
  check('unauthenticated /api/auth/me is 401', anon.status === 401)

  const anonPage = await call('/customers')
  check(
    'unauthenticated page redirects to /login',
    anonPage.status === 307 && (anonPage.headers.get('location') ?? '').includes('/login'),
    `status ${anonPage.status}`,
  )

  const authedPage = await call('/customers', { jar })
  check('authenticated page loads', authedPage.status === 200, `status ${authedPage.status}`)

  // ---------- role enforcement ----------
  const officerJar = makeJar()
  const officerLogin = await call('/api/auth/login', {
    method: 'POST',
    body: { email: 'officer@creditsense.pk', password: 'CreditSense2026!' },
    jar: officerJar,
  })
  check('demo loan officer can sign in', officerLogin.status === 200)

  const officerAdmin = await call('/admin/users', { jar: officerJar })
  check(
    'loan officer is blocked from admin (redirected to /no-access)',
    officerAdmin.status === 307 && (officerAdmin.headers.get('location') ?? '').includes('/no-access'),
    `status ${officerAdmin.status} -> ${officerAdmin.headers.get('location')}`,
  )

  const officerApi = await call('/api/admin/users/00000000-0000-0000-0000-000000000000', {
    method: 'PATCH',
    body: { action: 'suspend' },
    jar: officerJar,
  })
  check('loan officer is blocked from the admin API with 403', officerApi.status === 403)

  const adminJar = makeJar()
  await call('/api/auth/login', {
    method: 'POST',
    body: { email: 'admin@creditsense.pk', password: 'CreditSense2026!' },
    jar: adminJar,
  })
  const adminPage = await call('/admin/users', { jar: adminJar })
  check('administrator can open admin', adminPage.status === 200, `status ${adminPage.status}`)

  // ---------- session revocation ----------
  await db.query(`update sessions set revoked_at = now() where user_id = $1`, [created.rows[0].id])
  const revoked = await call('/api/auth/me', { jar })
  check(
    'a revoked session is rejected even though its JWT is still valid',
    revoked.status === 401,
    `status ${revoked.status}`,
  )

  // ---------- password reset ----------
  const forgot = await call('/api/auth/forgot-password', {
    method: 'POST',
    body: { email: EMAIL },
  })
  check('password reset request accepted', forgot.status === 200)

  const unknown = await call('/api/auth/forgot-password', {
    method: 'POST',
    body: { email: 'definitely-not-registered@nowhere.test' },
  })
  check(
    'reset for an unknown address responds identically (no enumeration)',
    unknown.status === forgot.status && unknown.text === forgot.text,
  )

  // ---------- audit trail ----------
  const audit = await db.query(
    `select action from audit_log where actor_id = $1 order by created_at`,
    [created.rows[0].id],
  )
  const actions = audit.rows.map((r) => r.action)
  check('signup was audited', actions.includes('user.signup'))
  check('verification was audited', actions.includes('user.email_verified'))
  check('reset request was audited', actions.includes('user.password_reset_requested'))

  // ---------- logout ----------
  const freshJar = makeJar()
  await call('/api/auth/login', {
    method: 'POST',
    body: { email: 'risk@creditsense.pk', password: 'CreditSense2026!' },
    jar: freshJar,
  })
  const beforeLogout = await call('/api/auth/me', { jar: freshJar })
  const logout = await call('/api/auth/logout', { method: 'POST', jar: freshJar })
  const afterLogout = await call('/api/auth/me', { jar: freshJar })
  check(
    'logout ends the session',
    beforeLogout.status === 200 && logout.status === 200 && afterLogout.status === 401,
    `${beforeLogout.status} -> ${afterLogout.status}`,
  )

  // ---------- cleanup ----------
  await db.query('delete from users where email_normalised = $1', [EMAIL])

  console.log(`  ${'─'.repeat(62)}`)
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
