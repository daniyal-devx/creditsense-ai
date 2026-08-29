/**
 * Password rules, shared by the browser and the server.
 *
 * Deliberately free of `server-only` and of any Node import, so the signup
 * form and the API route run *the same function*. Two copies of these rules
 * would eventually disagree, and the failure mode is horrible: a form that
 * says the password is fine, and a server that rejects it with no explanation
 * the user can act on.
 *
 * The client check is feedback. The server check is enforcement — anyone can
 * POST straight to the API, so the browser's opinion is never trusted.
 */

export const PASSWORD_MIN_LENGTH = 10
export const PASSWORD_MAX_LENGTH = 200

export interface PasswordCheck {
  valid: boolean
  /** 0–4, for the strength meter. */
  score: number
  /** What still needs fixing, phrased as instructions rather than complaints. */
  problems: string[]
}

const COMMON_PATTERNS = [
  'password', '12345678', 'qwerty', 'letmein', 'welcome', 'admin123',
  'iloveyou', 'abc123', 'monkey', 'dragon', 'creditsense', 'pakistan',
  'football', 'sunshine', 'princess',
]

/**
 * Length is weighted far more heavily than character classes.
 *
 * That is the modern guidance (NIST SP 800-63B): a long passphrase beats a
 * short string with a symbol bolted on the end. Mandating symbols mostly
 * produces "Password1!" — memorable to nobody and trivial for a cracker.
 */
export function checkPasswordStrength(
  password: string,
  context: { email?: string; name?: string } = {},
): PasswordCheck {
  const problems: string[] = []

  if (password.length < PASSWORD_MIN_LENGTH) {
    problems.push(`Use at least ${PASSWORD_MIN_LENGTH} characters`)
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    problems.push(`Keep it under ${PASSWORD_MAX_LENGTH} characters`)
  }

  const hasLower = /[a-z]/.test(password)
  const hasUpper = /[A-Z]/.test(password)
  const hasDigit = /\d/.test(password)
  const hasSymbol = /[^A-Za-z0-9]/.test(password)
  const classes = [hasLower, hasUpper, hasDigit, hasSymbol].filter(Boolean).length

  if (password.length > 0 && classes < 2) {
    problems.push('Mix letters with numbers or symbols')
  }

  // A password containing the user's own name or email is guessable by anyone
  // who has met them, which for a work tool is everyone they work with.
  const lower = password.toLowerCase()
  const localPart = context.email?.split('@')[0]?.toLowerCase()
  if (localPart && localPart.length >= 3 && lower.includes(localPart)) {
    problems.push('Do not include your email address')
  }
  if (context.name) {
    for (const part of context.name.toLowerCase().split(/\s+/)) {
      if (part.length >= 4 && lower.includes(part)) {
        problems.push('Do not include your name')
        break
      }
    }
  }

  if (password.length > 0 && COMMON_PATTERNS.some((c) => lower.includes(c))) {
    problems.push('Avoid common words and predictable patterns')
  }

  let score = 0
  if (password.length >= PASSWORD_MIN_LENGTH) score++
  if (password.length >= 14) score++
  if (classes >= 3) score++
  if (password.length >= 20 || (classes === 4 && password.length >= 16)) score++
  // Anything with an outstanding problem must never read as "Good".
  if (problems.length > 0) score = Math.min(score, 1)

  return { valid: password.length > 0 && problems.length === 0, score: Math.min(score, 4), problems }
}
