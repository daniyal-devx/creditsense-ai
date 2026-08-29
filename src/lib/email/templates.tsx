/**
 * Transactional email templates.
 *
 * Hand-written HTML with inline styles and a table-based layout, because that
 * is what actually renders in Outlook and Gmail. Every modern CSS feature the
 * rest of this product uses — flexbox, grid, custom properties, `oklch()` — is
 * unsupported or silently dropped by at least one major email client, and
 * Gmail strips `<style>` blocks entirely on some clients.
 *
 * Every template ships a plain-text alternative. It is not a formality: some
 * corporate mail gateways deliver only the text part, and a verification code
 * that arrives as an empty message is a user who cannot sign up.
 */

export interface EmailContent {
  subject: string
  html: string
  text: string
}

// Hex, not oklch — email clients do not understand modern colour spaces.
const BRAND = '#3341aa'
const INK = '#1d2130'
const MUTED = '#5c6274'
const BORDER = '#e3e6ee'
const SURFACE = '#ffffff'
const PAGE = '#f5f6fa'

function layout(options: {
  previewText: string
  heading: string
  body: string
  footerNote?: string
}): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>${escapeHtml(options.heading)}</title>
</head>
<body style="margin:0;padding:0;background-color:${PAGE};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">

<!-- Preview text: what shows in the inbox list next to the subject. The
     spacer characters stop the client pulling body copy in after it. -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">
  ${escapeHtml(options.previewText)}
  ${'&#847;&zwnj;&nbsp;'.repeat(60)}
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${PAGE};padding:24px 12px;">
  <tr>
    <td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background-color:${SURFACE};border:1px solid ${BORDER};border-radius:12px;overflow:hidden;">

        <tr>
          <td style="padding:28px 32px 0 32px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="background-color:${BRAND};border-radius:8px;width:34px;height:34px;text-align:center;vertical-align:middle;color:#ffffff;font-size:17px;font-weight:700;line-height:34px;">C</td>
                <td style="padding-left:10px;font-size:16px;font-weight:600;color:${INK};letter-spacing:-0.01em;">CreditSense&nbsp;AI</td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:24px 32px 8px 32px;">
            <h1 style="margin:0;font-size:21px;line-height:1.3;font-weight:600;color:${INK};letter-spacing:-0.01em;">${escapeHtml(options.heading)}</h1>
          </td>
        </tr>

        <tr>
          <td style="padding:0 32px 28px 32px;font-size:15px;line-height:1.6;color:${MUTED};">
            ${options.body}
          </td>
        </tr>

        <tr>
          <td style="padding:18px 32px;border-top:1px solid ${BORDER};background-color:${PAGE};font-size:12px;line-height:1.6;color:${MUTED};">
            ${options.footerNote ? `<p style="margin:0 0 8px 0;">${options.footerNote}</p>` : ''}
            <p style="margin:0;">CreditSense AI — credit risk and financial inclusion for Pakistan.</p>
            <p style="margin:6px 0 0 0;">This is an automated message. Please do not reply.</p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * The code is rendered as large, letter-spaced text rather than an image.
 * Most clients block remote images by default, and an image of a code is
 * unreadable to a screen reader and impossible to copy.
 */
function codeBlock(code: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;">
  <tr>
    <td align="center" style="background-color:${PAGE};border:1px solid ${BORDER};border-radius:10px;padding:20px 12px;">
      <div style="font-family:'SF Mono',Menlo,Consolas,monospace;font-size:34px;font-weight:700;letter-spacing:9px;color:${INK};line-height:1;">${escapeHtml(code)}</div>
    </td>
  </tr>
</table>`
}

export function verificationCodeEmail(options: {
  name: string
  code: string
  expiryMinutes: number
}): EmailContent {
  const firstName = options.name.split(' ')[0]
  return {
    subject: `${options.code} is your CreditSense verification code`,
    html: layout({
      previewText: `Your verification code is ${options.code}. It expires in ${options.expiryMinutes} minutes.`,
      heading: 'Confirm your email address',
      body: `
        <p style="margin:0 0 4px 0;">Hello ${escapeHtml(firstName)},</p>
        <p style="margin:12px 0 0 0;">Enter this code to finish setting up your CreditSense account.</p>
        ${codeBlock(options.code)}
        <p style="margin:0;">The code expires in <strong style="color:${INK};">${options.expiryMinutes} minutes</strong>.</p>
      `,
      footerNote:
        'If you did not create a CreditSense account, you can ignore this email — nothing will happen without the code.',
    }),
    text: [
      `Hello ${firstName},`,
      '',
      'Enter this code to finish setting up your CreditSense account:',
      '',
      `    ${options.code}`,
      '',
      `The code expires in ${options.expiryMinutes} minutes.`,
      '',
      'If you did not create a CreditSense account, you can ignore this email.',
      '',
      '— CreditSense AI',
    ].join('\n'),
  }
}

export function passwordResetEmail(options: {
  name: string
  code: string
  expiryMinutes: number
}): EmailContent {
  const firstName = options.name.split(' ')[0]
  return {
    subject: `${options.code} is your CreditSense password reset code`,
    html: layout({
      previewText: `Your password reset code is ${options.code}.`,
      heading: 'Reset your password',
      body: `
        <p style="margin:0 0 4px 0;">Hello ${escapeHtml(firstName)},</p>
        <p style="margin:12px 0 0 0;">Use this code to set a new password.</p>
        ${codeBlock(options.code)}
        <p style="margin:0 0 12px 0;">The code expires in <strong style="color:${INK};">${options.expiryMinutes} minutes</strong>.</p>
        <p style="margin:0;">Setting a new password signs you out everywhere else.</p>
      `,
      footerNote:
        'If you did not ask to reset your password, ignore this email and your password stays unchanged. You may want to review who has access to your inbox.',
    }),
    text: [
      `Hello ${firstName},`,
      '',
      'Use this code to set a new CreditSense password:',
      '',
      `    ${options.code}`,
      '',
      `The code expires in ${options.expiryMinutes} minutes.`,
      'Setting a new password signs you out everywhere else.',
      '',
      'If you did not ask for this, ignore this email — your password stays unchanged.',
      '',
      '— CreditSense AI',
    ].join('\n'),
  }
}

export function welcomeEmail(options: {
  name: string
  roleLabel: string
  appUrl: string
}): EmailContent {
  const firstName = options.name.split(' ')[0]
  return {
    subject: 'Welcome to CreditSense AI',
    html: layout({
      previewText: 'Your account is verified and ready to use.',
      heading: 'Your account is ready',
      body: `
        <p style="margin:0 0 4px 0;">Hello ${escapeHtml(firstName)},</p>
        <p style="margin:12px 0 0 0;">Your email is verified and your account is active. You are signed in as a <strong style="color:${INK};">${escapeHtml(options.roleLabel)}</strong>.</p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0;">
          <tr>
            <td style="background-color:${BRAND};border-radius:8px;">
              <a href="${escapeHtml(options.appUrl)}/dashboard" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">Open your dashboard</a>
            </td>
          </tr>
        </table>
        <p style="margin:0;">CreditSense turns wallet, top-up and bill payment behaviour into an explainable credit decision — so a lender can say yes to people a traditional bureau cannot see at all.</p>
      `,
    }),
    text: [
      `Hello ${firstName},`,
      '',
      `Your email is verified and your account is active. You are signed in as a ${options.roleLabel}.`,
      '',
      `Open your dashboard: ${options.appUrl}/dashboard`,
      '',
      '— CreditSense AI',
    ].join('\n'),
  }
}

export function newLoginAlertEmail(options: {
  name: string
  when: Date
  ipAddress: string | null
  userAgent: string | null
  appUrl: string
}): EmailContent {
  const firstName = options.name.split(' ')[0]
  const when = options.when.toLocaleString('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Karachi',
  })
  const device = describeUserAgent(options.userAgent)

  return {
    subject: 'New sign-in to your CreditSense account',
    html: layout({
      previewText: `A new sign-in from ${device} at ${when}.`,
      heading: 'New sign-in detected',
      body: `
        <p style="margin:0 0 4px 0;">Hello ${escapeHtml(firstName)},</p>
        <p style="margin:12px 0 16px 0;">Your account was just signed into from a device we have not seen before.</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${PAGE};border:1px solid ${BORDER};border-radius:10px;padding:4px 0;">
          <tr><td style="padding:10px 16px;font-size:14px;"><strong style="color:${INK};">When</strong><br>${escapeHtml(when)} (PKT)</td></tr>
          <tr><td style="padding:10px 16px;font-size:14px;border-top:1px solid ${BORDER};"><strong style="color:${INK};">Device</strong><br>${escapeHtml(device)}</td></tr>
          ${options.ipAddress ? `<tr><td style="padding:10px 16px;font-size:14px;border-top:1px solid ${BORDER};"><strong style="color:${INK};">IP address</strong><br>${escapeHtml(options.ipAddress)}</td></tr>` : ''}
        </table>
        <p style="margin:18px 0 0 0;">If this was you, no action is needed.</p>
      `,
      footerNote: `If this was not you, change your password immediately at ${escapeHtml(options.appUrl)}/settings — that signs out every other device.`,
    }),
    text: [
      `Hello ${firstName},`,
      '',
      'Your CreditSense account was signed into from a new device.',
      '',
      `  When:   ${when} (PKT)`,
      `  Device: ${device}`,
      ...(options.ipAddress ? [`  IP:     ${options.ipAddress}`] : []),
      '',
      'If this was you, no action is needed.',
      `If not, change your password immediately at ${options.appUrl}/settings.`,
      '',
      '— CreditSense AI',
    ].join('\n'),
  }
}

export function testEmail(appUrl: string): EmailContent {
  return {
    subject: 'CreditSense SMTP test',
    html: layout({
      previewText: 'Your Gmail SMTP configuration works.',
      heading: 'SMTP is working',
      body: `<p style="margin:0;">If you are reading this, <code>GMAIL_USER</code> and <code>GMAIL_APP_PASSWORD</code> are configured correctly and CreditSense can send email.</p>
             <p style="margin:14px 0 0 0;">Sent from <a href="${escapeHtml(appUrl)}" style="color:${BRAND};">${escapeHtml(appUrl)}</a>.</p>`,
    }),
    text: `SMTP is working. GMAIL_USER and GMAIL_APP_PASSWORD are configured correctly.\n\nSent from ${appUrl}\n\n— CreditSense AI`,
  }
}

/** A human-readable device description. Best-effort, never authoritative. */
export function describeUserAgent(userAgent: string | null): string {
  if (!userAgent) return 'Unknown device'

  const browser =
    /Edg\//.test(userAgent) ? 'Edge'
    : /OPR\//.test(userAgent) ? 'Opera'
    : /Chrome\//.test(userAgent) ? 'Chrome'
    : /Firefox\//.test(userAgent) ? 'Firefox'
    // Safari must be tested last: Chrome and Edge both include "Safari".
    : /Safari\//.test(userAgent) ? 'Safari'
    : 'Unknown browser'

  const os =
    /iPhone|iPad|iPod/.test(userAgent) ? 'iOS'
    : /Android/.test(userAgent) ? 'Android'
    : /Windows/.test(userAgent) ? 'Windows'
    : /Mac OS X/.test(userAgent) ? 'macOS'
    : /Linux/.test(userAgent) ? 'Linux'
    : 'Unknown OS'

  return `${browser} on ${os}`
}
