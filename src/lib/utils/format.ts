/**
 * Formatting helpers.
 *
 * Every number a loan officer reads passes through here, so that "Rs 45,000"
 * looks identical on the queue, the applicant view and the portfolio charts.
 * All money in this product is Pakistani Rupees.
 */

const PKR = 'Rs'

/** `45000` -> `"Rs 45,000"`. Set `decimals` when precision matters. */
export function formatPKR(
  amount: number | null | undefined,
  opts: { decimals?: number; sign?: boolean } = {},
): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return '—'
  const { decimals = 0, sign = false } = opts
  const abs = Math.abs(amount)
  const body = abs.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
  const prefix = amount < 0 ? '−' : sign ? '+' : ''
  return `${prefix}${PKR} ${body}`
}

/**
 * Compact money for tight mobile layouts and chart axes.
 * `1_250_000` -> `"Rs 12.5L"` using the South Asian lakh / crore convention,
 * which is what a Pakistani lender actually reads.
 */
export function formatPKRCompact(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return '—'
  const neg = amount < 0
  const n = Math.abs(amount)
  let body: string
  if (n >= 10_000_000) body = `${trimZero(n / 10_000_000)}Cr`
  else if (n >= 100_000) body = `${trimZero(n / 100_000)}L`
  else if (n >= 1_000) body = `${trimZero(n / 1_000)}K`
  else body = String(Math.round(n))
  return `${neg ? '−' : ''}${PKR} ${body}`
}

function trimZero(n: number): string {
  const s = n.toFixed(1)
  return s.endsWith('.0') ? s.slice(0, -2) : s
}

/** `12345.6` -> `"12,346"` */
export function formatNumber(n: number | null | undefined, decimals = 0): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  return n.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

/** `0.0842` -> `"8.4%"`. Pass `alreadyPercent` for values already on a 0–100 scale. */
export function formatPercent(
  value: number | null | undefined,
  opts: { decimals?: number; alreadyPercent?: boolean; sign?: boolean } = {},
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  const { decimals = 1, alreadyPercent = false, sign = false } = opts
  const pct = alreadyPercent ? value : value * 100
  const prefix = pct > 0 && sign ? '+' : ''
  return `${prefix}${pct.toFixed(decimals)}%`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function toDate(input: Date | string | number | null | undefined): Date | null {
  if (input === null || input === undefined) return null
  const d = input instanceof Date ? input : new Date(input)
  return Number.isNaN(d.getTime()) ? null : d
}

/** `"2026-03-14"` -> `"14 Mar 2026"` */
export function formatDate(input: Date | string | number | null | undefined): string {
  const d = toDate(input)
  if (!d) return '—'
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

/** `"14 Mar 2026, 3:42 PM"` */
export function formatDateTime(input: Date | string | number | null | undefined): string {
  const d = toDate(input)
  if (!d) return '—'
  const h = d.getHours()
  const h12 = h % 12 === 0 ? 12 : h % 12
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${formatDate(d)}, ${h12}:${mm} ${h < 12 ? 'AM' : 'PM'}`
}

/** `"3 days ago"`, `"just now"`, `"in 2 months"` */
export function formatRelative(input: Date | string | number | null | undefined): string {
  const d = toDate(input)
  if (!d) return '—'
  const diffMs = d.getTime() - Date.now()
  const abs = Math.abs(diffMs)
  const past = diffMs < 0

  const units: [number, string][] = [
    [1000 * 60 * 60 * 24 * 365, 'year'],
    [1000 * 60 * 60 * 24 * 30, 'month'],
    [1000 * 60 * 60 * 24 * 7, 'week'],
    [1000 * 60 * 60 * 24, 'day'],
    [1000 * 60 * 60, 'hour'],
    [1000 * 60, 'minute'],
  ]

  if (abs < 45_000) return 'just now'

  for (const [ms, unit] of units) {
    if (abs >= ms) {
      const n = Math.round(abs / ms)
      const label = `${n} ${unit}${n === 1 ? '' : 's'}`
      return past ? `${label} ago` : `in ${label}`
    }
  }
  return past ? 'moments ago' : 'in a moment'
}

/** `"3542112345671"` -> `"35421-1234567-1"` */
export function formatCNIC(cnic: string | null | undefined): string {
  if (!cnic) return '—'
  const digits = cnic.replace(/\D/g, '')
  if (digits.length !== 13) return cnic
  return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`
}

/**
 * Applicant identifiers are sensitive. Anywhere the full number is not
 * strictly needed for the decision, show it masked: `"35421-*******-1"`.
 */
export function maskCNIC(cnic: string | null | undefined): string {
  if (!cnic) return '—'
  const digits = cnic.replace(/\D/g, '')
  if (digits.length !== 13) return cnic
  return `${digits.slice(0, 5)}-*******-${digits.slice(12)}`
}

/** `"03001234567"` -> `"0300 123 4567"` */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return '—'
  const digits = phone.replace(/\D/g, '')
  const local = digits.startsWith('92') ? `0${digits.slice(2)}` : digits
  if (local.length !== 11) return phone
  return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`
}

/** `"Ayesha Khan"` -> `"AK"` — for avatars. */
export function initials(name: string | null | undefined): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/** `pluralize(1, 'application')` -> `"1 application"` */
export function pluralize(count: number, singular: string, plural?: string): string {
  return `${formatNumber(count)} ${count === 1 ? singular : (plural ?? `${singular}s`)}`
}

/** Capitalise the first letter, leave the rest alone. */
export function sentenceCase(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1)
}

/** `"loan_officer"` -> `"Loan Officer"` */
export function titleFromSlug(s: string): string {
  return s
    .split(/[_-]/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}
