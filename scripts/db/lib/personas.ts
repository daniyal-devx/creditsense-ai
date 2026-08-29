/**
 * Persona and credit-quality models.
 *
 * The four personas come straight from the problem statement — the people a
 * traditional underwriter cannot read. Each has a genuinely different *shape*
 * of income, and that shape is the whole point: a shopkeeper taking 40 small
 * payments a week and a freelancer taking two large ones a month both earn a
 * living, but only one of them looks like a salary, and neither looks like a
 * payslip.
 *
 * Quality tier is deliberately independent of persona. A driver can be a
 * excellent credit risk and a freelancer can be a terrible one; conflating the
 * two would bake the very prejudice this product exists to remove into the
 * synthetic data, and the model would then learn it.
 */

export type PersonaId = 'freelancer' | 'shopkeeper' | 'driver' | 'online_seller'
export type QualityTier = 'strong' | 'steady' | 'stretched' | 'distressed'

export interface PersonaModel {
  id: PersonaId
  label: string
  occupations: string[]
  /** Typical monthly income, in PKR, before the tier multiplier. */
  medianMonthlyIncome: number
  /** Spread of the log-normal income draw. Higher = lumpier earner. */
  incomeSigma: number
  /** How many income events land in a typical month. */
  incomeEventsPerMonth: [min: number, max: number]
  /** Which wallet transaction category their income arrives as. */
  incomeCategory: 'client_payment' | 'sales_receipt' | 'salary'
  /** Discretionary spend events per month. */
  spendEventsPerMonth: [min: number, max: number]
  /** Share of income that leaves as cash withdrawal rather than digital spend. */
  cashOutPropensity: [min: number, max: number]
  /** Months where this persona reliably earns more (1 = January). */
  seasonalPeakMonths: number[]
  seasonalUplift: number
  /** Business costs — a shopkeeper restocks, a freelancer mostly does not. */
  hasSupplierCosts: boolean
  description: string
}

export const PERSONAS: Record<PersonaId, PersonaModel> = {
  freelancer: {
    id: 'freelancer',
    label: 'Freelancer',
    occupations: [
      'Freelance graphic designer',
      'Freelance web developer',
      'Freelance content writer',
      'Freelance video editor',
      'Remote software engineer',
      'Freelance digital marketer',
    ],
    medianMonthlyIncome: 95_000,
    // The lumpiest earner in the set: a good month and a quiet month can differ
    // by 3x, which is exactly why a payslip-based underwriter rejects them.
    incomeSigma: 0.55,
    incomeEventsPerMonth: [1, 4],
    incomeCategory: 'client_payment',
    spendEventsPerMonth: [12, 26],
    cashOutPropensity: [0.15, 0.35],
    seasonalPeakMonths: [],
    seasonalUplift: 1,
    hasSupplierCosts: false,
    description:
      'Earns in foreign currency from a handful of clients. Real income, no payslip, no bureau file.',
  },

  shopkeeper: {
    id: 'shopkeeper',
    label: 'Shopkeeper',
    occupations: [
      'General store owner',
      'Kiryana shop owner',
      'Mobile accessories retailer',
      'Bakery owner',
      'Hardware store owner',
      'Pharmacy counter owner',
    ],
    medianMonthlyIncome: 78_000,
    // Many small sales average out, so the month-to-month total is fairly steady.
    incomeSigma: 0.22,
    incomeEventsPerMonth: [22, 45],
    incomeCategory: 'sales_receipt',
    spendEventsPerMonth: [10, 20],
    cashOutPropensity: [0.25, 0.45],
    // Ramadan and Eid trading, plus back-to-school.
    seasonalPeakMonths: [3, 4, 8],
    seasonalUplift: 1.35,
    hasSupplierCosts: true,
    description:
      'High volume of small digital receipts. Steady, seasonal, and entirely outside the formal credit system.',
  },

  driver: {
    id: 'driver',
    label: 'Ride-hailing driver',
    occupations: [
      'Careem captain',
      'inDrive driver',
      'Bykea rider',
      'Ride-hailing driver',
      'Intercity van driver',
    ],
    medianMonthlyIncome: 62_000,
    incomeSigma: 0.28,
    // Near-daily earnings, usually settled by the platform every few days.
    incomeEventsPerMonth: [16, 26],
    incomeCategory: 'sales_receipt',
    spendEventsPerMonth: [18, 32],
    cashOutPropensity: [0.3, 0.5],
    seasonalPeakMonths: [],
    seasonalUplift: 1,
    hasSupplierCosts: true,
    description:
      'Daily earnings with heavy fuel costs. Income is visible in the wallet but invisible to a bank.',
  },

  online_seller: {
    id: 'online_seller',
    label: 'Online seller',
    occupations: [
      'Instagram clothing seller',
      'Daraz marketplace seller',
      'Online cosmetics reseller',
      'Facebook marketplace trader',
      'Home-based crafts seller',
    ],
    medianMonthlyIncome: 71_000,
    // Cash-on-delivery settlements arrive in clumps, so months are bursty.
    incomeSigma: 0.45,
    incomeEventsPerMonth: [6, 18],
    incomeCategory: 'sales_receipt',
    spendEventsPerMonth: [12, 24],
    cashOutPropensity: [0.2, 0.4],
    seasonalPeakMonths: [3, 4, 11, 12],
    seasonalUplift: 1.45,
    hasSupplierCosts: true,
    description:
      'Bursty settlement income around sale seasons. Grows fast, but has no financial history to show for it.',
  },
}

export interface TierModel {
  id: QualityTier
  label: string
  /** Multiplies the persona's median income. */
  incomeMultiplier: [min: number, max: number]
  /** Extra income variance on top of the persona's own. */
  volatilityMultiplier: [min: number, max: number]
  /** Probability a given bill is paid on or before its due date. */
  billOnTimeRate: [min: number, max: number]
  /** Given a late payment, how many days late. */
  latenessDays: [min: number, max: number]
  /** Probability a bill is never paid at all. */
  billUnpaidRate: [min: number, max: number]
  /** Probability of missing a month's income entirely. */
  incomeGapRate: [min: number, max: number]
  /** Month-over-month income drift. Below 1 means declining. */
  incomeTrend: [min: number, max: number]
  /** Share of income kept rather than spent or withdrawn. */
  savingsRate: [min: number, max: number]
  /** How reliably they top up their phone. */
  topupRegularity: [min: number, max: number]
  /** Relative share of the generated population. */
  weight: number
}

export const TIERS: Record<QualityTier, TierModel> = {
  strong: {
    id: 'strong',
    label: 'Strong',
    incomeMultiplier: [1.15, 1.7],
    volatilityMultiplier: [0.6, 0.85],
    billOnTimeRate: [0.94, 1.0],
    latenessDays: [1, 4],
    billUnpaidRate: [0, 0.01],
    incomeGapRate: [0, 0.02],
    incomeTrend: [1.005, 1.03],
    savingsRate: [0.22, 0.4],
    topupRegularity: [0.9, 1.0],
    weight: 22,
  },
  steady: {
    id: 'steady',
    label: 'Steady',
    incomeMultiplier: [0.85, 1.2],
    volatilityMultiplier: [0.85, 1.1],
    billOnTimeRate: [0.8, 0.94],
    latenessDays: [1, 9],
    billUnpaidRate: [0.01, 0.04],
    incomeGapRate: [0.02, 0.06],
    incomeTrend: [0.995, 1.015],
    savingsRate: [0.1, 0.24],
    topupRegularity: [0.72, 0.92],
    weight: 34,
  },
  stretched: {
    id: 'stretched',
    label: 'Stretched',
    incomeMultiplier: [0.6, 0.95],
    volatilityMultiplier: [1.15, 1.55],
    billOnTimeRate: [0.55, 0.8],
    latenessDays: [4, 22],
    billUnpaidRate: [0.04, 0.12],
    incomeGapRate: [0.07, 0.16],
    incomeTrend: [0.975, 1.005],
    savingsRate: [0.01, 0.11],
    topupRegularity: [0.45, 0.75],
    weight: 27,
  },
  distressed: {
    id: 'distressed',
    label: 'Distressed',
    incomeMultiplier: [0.35, 0.7],
    volatilityMultiplier: [1.5, 2.2],
    billOnTimeRate: [0.2, 0.55],
    latenessDays: [10, 45],
    billUnpaidRate: [0.12, 0.3],
    incomeGapRate: [0.18, 0.35],
    incomeTrend: [0.93, 0.99],
    savingsRate: [-0.06, 0.04],
    topupRegularity: [0.2, 0.5],
    weight: 17,
  },
}

/**
 * Ground-truth default probability for a generated customer.
 *
 * The seed labels each customer with whether they *actually* defaulted, so
 * Phase 3 has something real to train and validate against. Without a label
 * the "model" would just be a hand-tuned heuristic wearing a lab coat.
 *
 * Tier drives it, with a nudge from behaviour, because tier is what actually
 * generated the behaviour.
 */
export const TIER_DEFAULT_RATE: Record<QualityTier, number> = {
  strong: 0.02,
  steady: 0.07,
  stretched: 0.21,
  distressed: 0.46,
}

export const PERSONA_IDS = Object.keys(PERSONAS) as PersonaId[]
export const TIER_IDS = Object.keys(TIERS) as QualityTier[]
