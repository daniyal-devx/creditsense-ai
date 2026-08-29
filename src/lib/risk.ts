/**
 * The CreditSense risk band model.
 *
 * The 0–1000 score is computed in Phase 3, but the *bands* are defined here in
 * Phase 0 because the design system, badges, charts and tables all need one
 * canonical answer to "what colour and what words go with this number?".
 *
 * A rule this file exists to enforce: colour never carries the meaning alone.
 * Every band ships with a `label`, a `verdict` sentence and an `icon` key, so
 * the meaning survives colour-blindness, greyscale printing, and a loan officer
 * reading the decision out loud over the phone.
 *
 * This module is intentionally free of React and of any Node built-in, so it
 * can be imported from a server component, an API route, a client component,
 * or a plain training script.
 */

export const SCORE_MIN = 0
export const SCORE_MAX = 1000

export type RiskBandId = 'very-low' | 'low' | 'moderate' | 'high' | 'very-high'

/** Icon keys resolved to real components in `components/risk/risk-icon.tsx`. */
export type RiskIconKey = 'shield-check' | 'circle-check' | 'circle-alert' | 'triangle-alert' | 'octagon-alert'

export interface RiskBand {
  id: RiskBandId
  /** Displayed next to the score. Always shown — never colour alone. */
  label: string
  /** For very tight mobile chips. */
  shortLabel: string
  /** Inclusive lower bound of the band. */
  min: number
  /** Inclusive upper bound of the band. */
  max: number
  /** Plain-language answer to "can this person repay?". No model jargon. */
  verdict: string
  /** One extra sentence of context for the applicant view. */
  description: string
  icon: RiskIconKey
  /** Tailwind classes — solid fill. Used for the gauge arc and solid badges. */
  solidClass: string
  /** Tailwind classes — soft fill. Used for badges inside dense tables. */
  softClass: string
  /** Text-only colour, for figures and chart labels. */
  textClass: string
  /** Border-only colour, for outlined cards. */
  borderClass: string
  /** Raw CSS variable, for canvas/SVG fills that cannot take a class. */
  cssVar: string
}

/**
 * Ordered best-to-worst. Bands are contiguous and cover 0–1000 with no gaps,
 * which `assertBandsAreContiguous` below verifies at module load in dev.
 */
export const RISK_BANDS: readonly RiskBand[] = [
  {
    id: 'very-low',
    label: 'Very Low Risk',
    shortLabel: 'Very Low',
    min: 850,
    max: 1000,
    verdict: 'Very likely to repay',
    description:
      'This applicant behaves like a reliably paying customer across every signal we can see. Approve with standard terms.',
    icon: 'shield-check',
    solidClass: 'bg-risk-verylow text-white',
    softClass: 'bg-risk-verylow-soft text-risk-verylow-on-soft',
    textClass: 'text-risk-verylow',
    borderClass: 'border-risk-verylow',
    cssVar: 'var(--risk-verylow)',
  },
  {
    id: 'low',
    label: 'Low Risk',
    shortLabel: 'Low',
    min: 700,
    max: 849,
    verdict: 'Likely to repay',
    description:
      'The repayment signals are consistently positive. Minor weaknesses exist but none that should block a decision.',
    icon: 'circle-check',
    solidClass: 'bg-risk-low text-white',
    softClass: 'bg-risk-low-soft text-risk-low-on-soft',
    textClass: 'text-risk-low',
    borderClass: 'border-risk-low',
    cssVar: 'var(--risk-low)',
  },
  {
    id: 'moderate',
    label: 'Moderate Risk',
    shortLabel: 'Moderate',
    min: 550,
    max: 699,
    verdict: 'May repay — review carefully',
    description:
      'The picture is mixed. Read the contributing factors below before deciding, and consider a smaller first loan.',
    icon: 'circle-alert',
    solidClass: 'bg-risk-moderate text-[oklch(0.22_0.03_70)]',
    softClass: 'bg-risk-moderate-soft text-risk-moderate-on-soft',
    textClass: 'text-risk-moderate',
    borderClass: 'border-risk-moderate',
    cssVar: 'var(--risk-moderate)',
  },
  {
    id: 'high',
    label: 'High Risk',
    shortLabel: 'High',
    min: 400,
    max: 549,
    verdict: 'Unlikely to repay',
    description:
      'Several signals point to repayment difficulty. Approve only with a reduced amount, collateral, or a guarantor.',
    icon: 'triangle-alert',
    solidClass: 'bg-risk-high text-white',
    softClass: 'bg-risk-high-soft text-risk-high-on-soft',
    textClass: 'text-risk-high',
    borderClass: 'border-risk-high',
    cssVar: 'var(--risk-high)',
  },
  {
    id: 'very-high',
    label: 'Very High Risk',
    shortLabel: 'Very High',
    min: 0,
    max: 399,
    verdict: 'Very unlikely to repay',
    description:
      'The behavioural signals strongly indicate default. Lending at any amount is not advisable on this profile.',
    icon: 'octagon-alert',
    solidClass: 'bg-risk-veryhigh text-white',
    softClass: 'bg-risk-veryhigh-soft text-risk-veryhigh-on-soft',
    textClass: 'text-risk-veryhigh',
    borderClass: 'border-risk-veryhigh',
    cssVar: 'var(--risk-veryhigh)',
  },
] as const

const BAND_BY_ID = new Map<RiskBandId, RiskBand>(RISK_BANDS.map((b) => [b.id, b]))

/** Clamp any number into the valid score range. */
export function clampScore(score: number): number {
  if (Number.isNaN(score)) return SCORE_MIN
  return Math.min(SCORE_MAX, Math.max(SCORE_MIN, Math.round(score)))
}

/** The single source of truth for turning a score into a band. */
export function getRiskBand(score: number): RiskBand {
  const s = clampScore(score)
  // Bands are ordered best-to-worst, so the first whose floor we clear wins.
  for (const band of RISK_BANDS) {
    if (s >= band.min) return band
  }
  return RISK_BANDS[RISK_BANDS.length - 1]
}

export function getRiskBandById(id: RiskBandId): RiskBand {
  const band = BAND_BY_ID.get(id)
  if (!band) throw new Error(`Unknown risk band: ${id}`)
  return band
}

/** Where the score sits inside its own band, 0–1. Drives the gauge fill. */
export function positionInBand(score: number): number {
  const band = getRiskBand(score)
  const span = band.max - band.min
  if (span <= 0) return 1
  return (clampScore(score) - band.min) / span
}

/** Where the score sits across the whole 0–1000 range, 0–1. */
export function positionInRange(score: number): number {
  return (clampScore(score) - SCORE_MIN) / (SCORE_MAX - SCORE_MIN)
}

/**
 * Bands ordered worst-to-best — the order risk distribution charts and
 * portfolio stacked bars should read in.
 */
export const RISK_BANDS_ASCENDING: readonly RiskBand[] = [...RISK_BANDS].reverse()

/**
 * Development-time guard. If someone edits a band boundary and accidentally
 * leaves a gap (or an overlap), every score in that gap would silently fall
 * through to "Very High Risk" — a wrong lending decision caused by a typo.
 */
function assertBandsAreContiguous() {
  const ascending = [...RISK_BANDS].sort((a, b) => a.min - b.min)
  if (ascending[0].min !== SCORE_MIN) {
    throw new Error(`Risk bands must start at ${SCORE_MIN}, got ${ascending[0].min}`)
  }
  if (ascending[ascending.length - 1].max !== SCORE_MAX) {
    throw new Error(`Risk bands must end at ${SCORE_MAX}, got ${ascending[ascending.length - 1].max}`)
  }
  for (let i = 1; i < ascending.length; i++) {
    const prev = ascending[i - 1]
    const cur = ascending[i]
    if (cur.min !== prev.max + 1) {
      throw new Error(
        `Risk bands must be contiguous: "${prev.id}" ends at ${prev.max} but "${cur.id}" starts at ${cur.min}`,
      )
    }
  }
}

if (process.env.NODE_ENV !== 'production') {
  assertBandsAreContiguous()
}
