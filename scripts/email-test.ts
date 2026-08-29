/**
 * Confirm Gmail SMTP is configured correctly.
 *
 *   npm run email:test                     verify the connection only
 *   npm run email:test -- you@gmail.com    send a real test message
 *
 * Worth having as its own script because SMTP misconfiguration surfaces as a
 * signup that appears to succeed but never delivers a code — which looks like
 * a bug in the signup flow rather than a missing App Password.
 */
import nodemailer from 'nodemailer'
import type SMTPTransport from 'nodemailer/lib/smtp-transport'
import { loadEnv } from './db/env'

// The template module has no server-only import, so it can be used here.
import { testEmail } from '../src/lib/email/templates'

function mask(value: string | undefined): string {
  if (!value) return '(not set)'
  return value.replace(/^(.{2}).*(@.*)$/, '$1•••$2')
}

async function main() {
  loadEnv()

  const user = process.env.GMAIL_USER
  const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, '')
  const host = process.env.SMTP_HOST ?? 'smtp.gmail.com'
  const port = Number(process.env.SMTP_PORT ?? 587)
  const recipient = process.argv[2]

  console.log('\n  Gmail SMTP check')
  console.log('  ' + '─'.repeat(56))
  console.log(`  Host          ${host}:${port}`)
  console.log(`  User          ${mask(user)}`)
  console.log(`  App password  ${pass ? `${pass.length} characters` : '(not set)'}`)
  console.log(`  From          ${process.env.EMAIL_FROM ?? `CreditSense AI <${user ?? '—'}>`}`)
  console.log()

  if (!user || !pass) {
    console.log('  ✖ GMAIL_USER and GMAIL_APP_PASSWORD are not both set.\n')
    console.log('    1. Use a dedicated Gmail account if you can.')
    console.log('    2. Turn on 2-Step Verification at myaccount.google.com/security')
    console.log('       (App Passwords do not exist without it).')
    console.log('    3. Create one at myaccount.google.com/apppasswords')
    console.log('    4. Paste the 16 characters into GMAIL_APP_PASSWORD in .env.local,')
    console.log('       WITHOUT the spaces Google displays.\n')
    console.log('  The app still works without this — verification codes are printed')
    console.log('  to the server console in development instead.\n')
    process.exit(1)
  }

  if (pass.length !== 16) {
    console.log(
      `  ⚠ A Gmail App Password is 16 characters; this one is ${pass.length}.\n` +
        '    You may have pasted your normal Gmail password, which will not work.\n',
    )
  }

  const options: SMTPTransport.Options = {
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    connectionTimeout: 15_000,
  }
  const transport = nodemailer.createTransport(options)

  process.stdout.write('  Verifying the connection … ')
  try {
    await transport.verify()
    console.log('ok')
  } catch (err) {
    console.log('FAILED\n')
    const message = err instanceof Error ? err.message : String(err)
    console.error(`  ${message}\n`)

    if (message.includes('535')) {
      console.log('  535 means the credentials were rejected. Almost always one of:')
      console.log('    · using your normal Gmail password instead of an App Password')
      console.log('    · spaces left in the pasted App Password')
      console.log('    · 2-Step Verification not enabled on the account\n')
    } else if (message.includes('ETIMEDOUT') || message.includes('ECONNREFUSED')) {
      console.log('  The connection timed out. Your network may block SMTP.')
      console.log('    Try SMTP_PORT=465, or a different network.\n')
    }
    process.exit(1)
  }

  if (!recipient) {
    console.log('\n  Connection is good. To send a real message:\n')
    console.log('    npm run email:test -- you@example.com\n')
    return
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const content = testEmail(appUrl)

  process.stdout.write(`  Sending to ${recipient} … `)
  try {
    const info = await transport.sendMail({
      from: process.env.EMAIL_FROM ?? `CreditSense AI <${user}>`,
      to: recipient,
      subject: content.subject,
      text: content.text,
      html: content.html,
    })
    console.log('sent')
    console.log(`\n  Message ID: ${info.messageId}`)
    console.log('  Check the inbox — and the spam folder, where raw Gmail sends often land.\n')
  } catch (err) {
    console.log('FAILED\n')
    console.error(`  ${err instanceof Error ? err.message : String(err)}\n`)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('\n✖ Email test failed:', err)
  process.exit(1)
})
