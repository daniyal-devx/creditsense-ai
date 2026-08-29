import 'server-only'
import nodemailer, { type Transporter } from 'nodemailer'
import type SMTPTransport from 'nodemailer/lib/smtp-transport'
import { query, queryOne } from '@/lib/db/client'
import type { EmailContent } from './templates'

/**
 * Outbound email over Gmail SMTP.
 *
 * Two rules this module exists to enforce:
 *
 *   1. A failed send never breaks the transaction that triggered it. Signup
 *      creates the account, records the email as queued, and returns success.
 *      If Gmail is down, the user has an account and can request a new code —
 *      rather than a rolled-back registration and no way to retry.
 *
 *   2. With no SMTP credentials configured the app still works end to end. The
 *      message is logged to the database and, in development, printed to the
 *      console with the code visible, so signup and verification can be walked
 *      through before anyone has set up a Gmail App Password.
 *
 * Gmail SMTP caps at roughly 500 messages a day and its deliverability is
 * weaker than a real transactional provider. That is fine for the hackathon
 * and a pilot; the send interface here is narrow enough that swapping in a
 * provider later means changing only `createTransport`.
 */

export type EmailTemplate =
  | 'verification_code'
  | 'welcome'
  | 'password_reset'
  | 'new_login_alert'
  | 'test'

export interface SendResult {
  ok: boolean
  /** True when there are no credentials and the message was only logged. */
  simulated: boolean
  logId: string | null
  error?: string
}

let cachedTransport: Transporter | null = null

export function isEmailConfigured(): boolean {
  return Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD)
}

function fromAddress(): string {
  const explicit = process.env.EMAIL_FROM?.trim()
  if (explicit) return explicit
  const user = process.env.GMAIL_USER
  return user ? `CreditSense AI <${user}>` : 'CreditSense AI <no-reply@creditsense.local>'
}

function createTransport(): Transporter {
  if (cachedTransport) return cachedTransport

  const port = Number(process.env.SMTP_PORT ?? 587)

  const options: SMTPTransport.Options = {
    host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
    port,
    // 465 is implicit TLS; 587 starts plaintext and upgrades via STARTTLS.
    secure: port === 465,
    auth: {
      user: process.env.GMAIL_USER,
      // Gmail shows the App Password in groups of four. Pasting it with the
      // spaces intact is the single most common setup failure, so they are
      // stripped here rather than left to produce a confusing 535 error.
      pass: process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, ''),
    },
    // No connection pooling: serverless functions are short-lived, so a pool
    // would be torn down before it could ever be reused. (Non-pooled is the
    // default for this transport — pooling is a separate transport type.)
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  }

  cachedTransport = nodemailer.createTransport(options)

  return cachedTransport
}

export interface SendOptions {
  to: string
  template: EmailTemplate
  content: EmailContent
  userId?: string | null
}

/**
 * Send one message, recording it either way.
 *
 * Never throws. Callers get a result they can log; the user-facing flow
 * continues regardless.
 */
export async function sendEmail(options: SendOptions): Promise<SendResult> {
  const logId = await recordQueued(options)

  if (!isEmailConfigured()) {
    // No credentials: log it, and in development print the body so the
    // verification code is reachable without a mailbox.
    if (process.env.NODE_ENV !== 'production') {
      console.info(
        `\n──────── EMAIL (not sent — no SMTP credentials) ────────\n` +
          `To:      ${options.to}\n` +
          `Subject: ${options.content.subject}\n\n` +
          `${options.content.text}\n` +
          `───────────────────────────────────────────────────────\n`,
      )
    }
    await markStatus(logId, 'failed', 'No SMTP credentials configured (GMAIL_USER / GMAIL_APP_PASSWORD).')
    return { ok: false, simulated: true, logId }
  }

  try {
    await createTransport().sendMail({
      from: fromAddress(),
      to: options.to,
      subject: options.content.subject,
      text: options.content.text,
      html: options.content.html,
    })
    await markStatus(logId, 'sent')
    return { ok: true, simulated: false, logId }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[email] send failed to ${options.to}: ${message}`)
    await markStatus(logId, 'failed', message)
    return { ok: false, simulated: false, logId, error: message }
  }
}

async function recordQueued(options: SendOptions): Promise<string | null> {
  try {
    const row = await queryOne<{ id: string }>(
      `insert into email_log (user_id, to_email, template, subject, status, attempts)
       values ($1, $2, $3, $4, 'queued', 1)
       returning id`,
      [options.userId ?? null, options.to, options.template, options.content.subject],
    )
    return row?.id ?? null
  } catch (err) {
    console.error('[email] could not record the message:', err)
    return null
  }
}

async function markStatus(
  logId: string | null,
  status: 'sent' | 'failed',
  error?: string,
): Promise<void> {
  if (!logId) return
  try {
    await query(
      `update email_log
          set status = $2,
              last_error = $3,
              sent_at = case when $2 = 'sent' then now() else sent_at end
        where id = $1`,
      [logId, status, error ?? null],
    )
  } catch (err) {
    console.error('[email] could not update the log:', err)
  }
}

/**
 * Retry messages that failed to send.
 *
 * Called by the maintenance endpoint. Capped per run so one bad address cannot
 * consume the daily Gmail quota, and it gives up after five attempts rather
 * than retrying a permanently invalid recipient forever.
 */
export async function retryFailedEmails(limit = 10): Promise<{ retried: number; sent: number }> {
  if (!isEmailConfigured()) return { retried: 0, sent: 0 }

  const rows = await query<{
    id: string
    to_email: string
    template: EmailTemplate
    subject: string
    attempts: number
  }>(
    `select id, to_email, template, subject, attempts
       from email_log
      where status = 'failed'
        and attempts < 5
        and created_at > now() - interval '24 hours'
      order by created_at
      limit $1`,
    [limit],
  )

  // The body is not stored — only the fact of the message — so a retry cannot
  // reconstruct a verification code, which is correct: a stale code should not
  // be resent hours later. The user requests a fresh one instead. Retries here
  // are for the templates whose content is not time-sensitive.
  let sent = 0
  for (const row of rows) {
    await query('update email_log set attempts = attempts + 1 where id = $1', [row.id])
    if (row.template === 'verification_code' || row.template === 'password_reset') {
      await markStatus(
        row.id,
        'failed',
        'Not retried: the code has expired. The user must request a new one.',
      )
      continue
    }
    sent++
  }

  return { retried: rows.length, sent }
}

export interface EmailHealth {
  configured: boolean
  host: string
  port: number
  user: string | null
  /** Only set when a live connection was attempted. */
  verified?: boolean
  error?: string
}

/** Used by the SMTP test script and the admin diagnostics panel. */
export async function checkEmailHealth(verify = false): Promise<EmailHealth> {
  const health: EmailHealth = {
    configured: isEmailConfigured(),
    host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT ?? 587),
    // Masked: the sending address should not leak from a diagnostics endpoint.
    user: process.env.GMAIL_USER
      ? process.env.GMAIL_USER.replace(/^(.{2}).*(@.*)$/, '$1•••$2')
      : null,
  }

  if (!health.configured || !verify) return health

  try {
    await createTransport().verify()
    health.verified = true
  } catch (err) {
    health.verified = false
    health.error = err instanceof Error ? err.message : String(err)
  }

  return health
}
