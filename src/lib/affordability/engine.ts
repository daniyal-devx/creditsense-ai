import type { CustomerFeatures } from '@/lib/features/types'
import type { CreditScore } from '@/lib/scoring/score'

/**
 * The affordability engine.
 *
 * A score answers "will they repay?". It says nothing about "how much?", and
 * conflating the two is how thin-file lending goes wrong in both directions:
 * a high scorer gets offered more than their cash flow can carry, and a
 * moderate scorer gets refused entirely when a smaller loan would have been
 * perfectly safe.
 *
 * So this is a separate calculation on the same signals, and it is deliberately
 * conservative in one specific way: it sizes the instalment against the income
 * of a BAD month, not an average one. An informal worker's average month is a
 * fiction they cannot pay an instalment out of — the quiet month is the one
 * that causes the default, and that is the month the loan has to survive.
 *
 * Every number here is derived arithmetically and every step is exposed, so a
 * loan officer can explain the offer rather than just quote it.
 */

export interface AffordabilityInput {
  features: CustomerFeatures
  score: CreditScore
  /** What the applicant asked for, when there is an application. */
  requestedAmount?: number
  requestedTenorMonths?: number
}

export interface AffordabilityAssessment {
  // ---- income ----
  /** Mean monthly income over the observation window. */
  averageMonthlyIncome: number
  /** The median — the honest headline for a lumpy earner. */
  medianMonthlyIncome: number
  /**
   * The income we actually underwrite against: roughly a one-in-six bad month,
   * derived from the median and the observed volatility.
   */
  stressedMonthlyIncome: number

  // ---- outgoings ----
  averageMonthlyOutflow: number
  /** Recurring obligations we can see: utilities and existing instalments. */
  committedOutflow: number
  /** What is genuinely left over in a stressed month. */
  disposableIncome: number

  // ---- the offer ----
  /** The largest instalment that clears every affordability rule. */
  maxAffordableInstalment: number
  /** What we would actually offer — the instalment, with a safety margin. */
  recommendedInstalment: number
  recommendedTenorMonths: number
  /** The principal that instalment supports over that tenor. */
  recommendedAmount: number
  /** The absolute ceiling, before the safety margin. */
  maximumAmount: number

  annualRate: number
  totalRepayable: number
  totalInterest: number

  // ---- the reasoning ----
  /** Instalment as a share of stressed income. */
  debtServiceRatio: number
  /** Instalment as a share of average income — the headline lenders quote. */
  debtServiceRatioAverage: number
  /** Which rule was the binding constraint. */
  bindingConstraint: string
  /** Every rule that was applied, with the ceiling each one implied. */
  constraints: AffordabilityConstraint[]

  // ---- the verdict ----
  decision: 'affordable' | 'reduced' | 'not_affordable'
  /** Set when the applicant asked for more than we can support. */
  requestedVsRecommended?: {
    requested: number
    recommended: number
    shortfall: number
  }
  /** Plain-language reasoning, ordered as an officer would explain it. */
  reasoning: string[]
  warnings: string[]
}

export interface AffordabilityConstraint {
  id: string
  label: string
  /**
   * The largest loan this rule alone would permit, at the selected tenor.
   *
   * Every rule is expressed as an *amount* ceiling, including the cash-flow
   * ones that are naturally instalment limits. An earlier version mixed the
   * two — cash-flow rules as instalment caps and the income multiple as an
   * instalment cap computed at a fixed 12-month tenor — which meant the "4×
   * monthly income" rule silently permitted 5.5× once an 18-month term was
   * chosen. Converting everything to one unit at the actual tenor makes the
   * comparison sound and lets the panel show a loan officer what each rule
   * would have allowed.
   */
  amountCeiling: number
  /** The instalment that ceiling implies, for reference. */
  instalmentCeiling: number
  explanation: string
  /** True when this is the rule that actually bound the offer. */
  binding: boolean
}

// ---------------------------------------------------------------------------
// Policy
// ---------------------------------------------------------------------------

/**
 * These are policy, not physics. A real lender sets them from their own loss
 * experience and appetite; they live here in one block so a risk officer can
 * see and change them without reading the algorithm.
 */
export const AFFORDABILITY_POLICY = {
  /** Ceiling on instalment ÷ stressed income. */
  maxDebtServiceRatio: 0.35,
  /** A tighter ceiling for applicants the score already flags. */
  maxDebtServiceRatioHighRisk: 0.22,
  /** Never lend against more than this share of genuinely spare cash. */
  maxDisposableShare: 0.6,
  /** Keep this much of the disposable income untouched, as a buffer. */
  safetyMargin: 0.15,
  /** Hard floor: an offer below this is not worth originating. */
  minimumLoanAmount: 10_000,
  /** Hard ceiling for an unsecured first loan on behavioural data alone. */
  absoluteMaximum: 500_000,
  /** A first loan never exceeds this multiple of one month's income. */
  maxIncomeMultiple: 4,
  tenorOptions: [6, 9, 12, 18, 24] as const,
  defaultTenor: 12,
  /** Annual rate by risk band — the price of the risk taken. */
  ratesByBand: {
    'very-low': 0.24,
    low: 0.28,
    moderate: 0.34,
    high: 0.42,
    'very-high': 0.48,
  } as Record<string, number>,
  /** Minimum wallet history before we will lend at all. */
  minimumTenureMonths: 4,
} as const

function round(value: number, to = 1): number {
  return Math.round(value / to) * to
}

/** A flat instalment: principal plus simple interest over the tenor. */
export function instalmentFor(principal: number, annualRate: number, months: number): number {
  const total = principal * (1 + (annualRate * months) / 12)
  return total / months
}

/** The inverse: the principal a given instalment supports. */
export function principalFor(instalment: number, annualRate: number, months: number): number {
  const total = instalment * months
  return total / (1 + (annualRate * months) / 12)
}

/**
 * The income to underwrite against.
 *
 * Not the mean — for a freelancer whose months run 40k, 180k, 30k, the mean of
 * 83k describes no month they have actually lived. We take the median and
 * discount it by the observed volatility, landing near the lower end of their
 * real range. Someone with steady income is barely discounted; someone whose
 * income swings is discounted hard, which is exactly the intent.
 */
export function stressedIncome(features: CustomerFeatures): number {
  const base = features.medianMonthlyInflow > 0
    ? features.medianMonthlyInflow
    : features.avgMonthlyInflow

  // Capped at 0.45 so an extremely volatile earner is not discounted to zero —
  // that would refuse credit to precisely the population this product exists
  // to serve, rather than sizing it sensibly.
  const volatilityDiscount = Math.min(0.45, features.incomeVolatility * 0.5)

  // A falling income is the sharper risk, so a downward trend discounts
  // further. An upward trend earns no credit: it may not last, and lending
  // against income that has not arrived yet is how people get over-extended.
  const trendDiscount = features.incomeTrend90d < 0.9
    ? Math.min(0.25, (0.9 - features.incomeTrend90d) * 0.8)
    : 0

  return Math.max(0, base * (1 - volatilityDiscount - trendDiscount))
}

/**
 * Recurring obligations that must be paid before any instalment.
 *
 * Utilities are taken from the actual bills on record rather than assumed, and
 * existing loan instalments are counted in full.
 */
export function committedOutflow(features: CustomerFeatures): number {
  // Average monthly utility spend, derived from what they actually pay.
  const monthsObserved = Math.max(1, features.observationDays / 30.44)
  const billsPerMonth = features.billsTotal / monthsObserved

  // The feature layer does not carry the total bill amount, so it is inferred
  // from the outflow attributable to bill payments. Deliberately generous:
  // understating someone's commitments is how an unaffordable loan gets made.
  const estimatedUtilities = features.avgMonthlyOutflow * 0.18 * Math.min(1.5, billsPerMonth / 2)

  // An existing loan's instalment is unknown here, so it is approximated from
  // the outstanding balance over a typical remaining tenor.
  const existingInstalments = features.totalOutstanding > 0 ? features.totalOutstanding / 9 : 0

  return round(estimatedUtilities + existingInstalments, 10)
}

export function assessAffordability(input: AffordabilityInput): AffordabilityAssessment {
  const { features, score, requestedAmount, requestedTenorMonths } = input

  const averageMonthlyIncome = features.avgMonthlyInflow
  const medianMonthlyIncome = features.medianMonthlyInflow
  const stressed = stressedIncome(features)
  const committed = committedOutflow(features)

  // What is genuinely spare in a bad month, after the obligations they already
  // have. Floored at zero: a negative figure means no capacity, not a negative
  // instalment.
  const disposableIncome = Math.max(0, stressed - committed)

  const isHigherRisk = score.band.id === 'high' || score.band.id === 'very-high'
  const dsrCap = isHigherRisk
    ? AFFORDABILITY_POLICY.maxDebtServiceRatioHighRisk
    : AFFORDABILITY_POLICY.maxDebtServiceRatio

  const annualRate =
    AFFORDABILITY_POLICY.ratesByBand[score.band.id] ?? AFFORDABILITY_POLICY.ratesByBand.moderate

  // The tenor has to be chosen first, because every cash-flow rule converts
  // between an instalment and an amount through it.
  const tenor = pickTenor(requestedTenorMonths, features, score)

  /** An instalment rule, expressed as the loan it would support at this tenor. */
  const fromInstalment = (instalment: number) =>
    principalFor(Math.max(0, instalment), annualRate, tenor)

  const constraints: AffordabilityConstraint[] = [
    {
      id: 'dsr',
      label: 'Debt-service ratio',
      instalmentCeiling: stressed * dsrCap,
      amountCeiling: fromInstalment(stressed * dsrCap),
      explanation: `The instalment must stay under ${Math.round(dsrCap * 100)}% of a bad month's income, not an average one.${
        isHigherRisk ? ' A tighter limit applies because the score flags elevated risk.' : ''
      }`,
      binding: false,
    },
    {
      id: 'disposable',
      label: 'Spare cash after commitments',
      instalmentCeiling: disposableIncome * AFFORDABILITY_POLICY.maxDisposableShare,
      amountCeiling: fromInstalment(disposableIncome * AFFORDABILITY_POLICY.maxDisposableShare),
      explanation: `Only ${Math.round(AFFORDABILITY_POLICY.maxDisposableShare * 100)}% of what is genuinely left over after existing bills and loans can be committed.`,
      binding: false,
    },
    {
      id: 'income_multiple',
      label: 'Income multiple',
      // A cap on the *amount*, so it holds whatever tenor is chosen.
      amountCeiling: averageMonthlyIncome * AFFORDABILITY_POLICY.maxIncomeMultiple,
      instalmentCeiling: instalmentFor(
        averageMonthlyIncome * AFFORDABILITY_POLICY.maxIncomeMultiple,
        annualRate,
        tenor,
      ),
      explanation: `A first unsecured loan is capped at ${AFFORDABILITY_POLICY.maxIncomeMultiple}× monthly income regardless of how affordable the instalment looks. Stretching the term does not lift this.`,
      binding: false,
    },
    {
      id: 'absolute_cap',
      label: 'Product ceiling',
      amountCeiling: AFFORDABILITY_POLICY.absoluteMaximum,
      instalmentCeiling: instalmentFor(AFFORDABILITY_POLICY.absoluteMaximum, annualRate, tenor),
      explanation: `No unsecured loan on behavioural data alone exceeds ${AFFORDABILITY_POLICY.absoluteMaximum.toLocaleString()} rupees.`,
      binding: false,
    },
  ]

  // The lowest ceiling wins — that is what "binding constraint" means.
  const maximumAmountRaw = Math.max(0, Math.min(...constraints.map((c) => c.amountCeiling)))
  const bindingRule = constraints.reduce((lowest, c) =>
    c.amountCeiling < lowest.amountCeiling ? c : lowest,
  )
  bindingRule.binding = true

  // The safety margin comes off the top. The maximum affordable is a limit,
  // not a target: lending right at someone's ceiling leaves no room for the
  // month their motorbike breaks.
  const recommendedAmount = round(
    maximumAmountRaw * (1 - AFFORDABILITY_POLICY.safetyMargin),
    500,
  )
  const maximumAmount = round(maximumAmountRaw, 500)

  // Derived from the amount, so the two can never disagree.
  const recommendedInstalment = round(instalmentFor(recommendedAmount, annualRate, tenor), 50)
  const maxAffordableInstalment = round(instalmentFor(maximumAmount, annualRate, tenor), 50)

  const totalRepayable = recommendedInstalment * tenor
  const totalInterest = Math.max(0, totalRepayable - recommendedAmount)

  const debtServiceRatio = stressed > 0 ? recommendedInstalment / stressed : 1
  const debtServiceRatioAverage =
    averageMonthlyIncome > 0 ? recommendedInstalment / averageMonthlyIncome : 1

  // ---- verdict ----
  const warnings: string[] = []
  let decision: AffordabilityAssessment['decision'] = 'affordable'

  if (features.walletTenureMonths < AFFORDABILITY_POLICY.minimumTenureMonths) {
    decision = 'not_affordable'
    warnings.push(
      `Only ${features.walletTenureMonths} months of wallet history — below the ${AFFORDABILITY_POLICY.minimumTenureMonths}-month minimum, so there is not enough behaviour to lend against.`,
    )
  } else if (recommendedAmount < AFFORDABILITY_POLICY.minimumLoanAmount) {
    decision = 'not_affordable'
    warnings.push(
      `Affordable instalment supports only ${Math.round(recommendedAmount).toLocaleString()} rupees, below the ${AFFORDABILITY_POLICY.minimumLoanAmount.toLocaleString()} minimum.`,
    )
  }

  if (disposableIncome <= 0) {
    warnings.push(
      'Committed outgoings already match or exceed a bad month’s income, leaving nothing to service a loan.',
    )
  }
  if (features.incomeTrend90d < 0.8) {
    warnings.push(
      `Income has fallen ${Math.round((1 - features.incomeTrend90d) * 100)}% over the last quarter, so today's capacity may not hold.`,
    )
  }
  if (features.currentMissedStreak >= 2) {
    warnings.push(
      `${features.currentMissedStreak} consecutive months with a missed bill — an existing obligation is already going unpaid.`,
    )
  }

  let requestedVsRecommended: AffordabilityAssessment['requestedVsRecommended']
  if (requestedAmount && requestedAmount > 0) {
    if (requestedAmount > recommendedAmount && decision === 'affordable') {
      decision = 'reduced'
    }
    requestedVsRecommended = {
      requested: requestedAmount,
      recommended: recommendedAmount,
      shortfall: Math.max(0, requestedAmount - recommendedAmount),
    }
  }

  return {
    averageMonthlyIncome: round(averageMonthlyIncome),
    medianMonthlyIncome: round(medianMonthlyIncome),
    stressedMonthlyIncome: round(stressed),
    averageMonthlyOutflow: round(features.avgMonthlyOutflow),
    committedOutflow: committed,
    disposableIncome: round(disposableIncome),
    maxAffordableInstalment: round(maxAffordableInstalment, 50),
    recommendedInstalment,
    recommendedTenorMonths: tenor,
    recommendedAmount: Math.max(0, recommendedAmount),
    maximumAmount: Math.max(0, maximumAmount),
    annualRate,
    totalRepayable: round(totalRepayable),
    totalInterest: round(totalInterest),
    debtServiceRatio,
    debtServiceRatioAverage,
    bindingConstraint: bindingRule.label,
    constraints,
    decision,
    requestedVsRecommended,
    reasoning: buildReasoning({
      features,
      score,
      stressed,
      committed,
      disposableIncome,
      recommendedInstalment,
      recommendedAmount,
      tenor,
      annualRate,
      bindingRule,
      dsrCap,
    }),
    warnings,
  }
}

/**
 * Pick the tenor.
 *
 * A longer tenor lowers the instalment and so raises the amount we can lend —
 * but it also keeps the applicant exposed for longer, and a volatile income
 * has more chances to fail over 24 months than over 9. So volatility shortens
 * the term rather than lengthening it, even though lengthening would let us
 * lend more.
 */
function pickTenor(
  requested: number | undefined,
  features: CustomerFeatures,
  score: CreditScore,
): number {
  const options = AFFORDABILITY_POLICY.tenorOptions

  if (requested && options.includes(requested as (typeof options)[number])) {
    // Honour the request unless the risk profile argues against a long term.
    const cap = features.incomeVolatility > 0.8 || score.band.id === 'high' ? 12 : 24
    return Math.min(requested, cap)
  }

  if (features.incomeVolatility > 0.85) return 9
  if (score.band.id === 'very-low' || score.band.id === 'low') return 18
  if (score.band.id === 'high' || score.band.id === 'very-high') return 9
  return AFFORDABILITY_POLICY.defaultTenor
}

function buildReasoning(ctx: {
  features: CustomerFeatures
  score: CreditScore
  stressed: number
  committed: number
  disposableIncome: number
  recommendedInstalment: number
  recommendedAmount: number
  tenor: number
  annualRate: number
  bindingRule: AffordabilityConstraint
  dsrCap: number
}): string[] {
  const money = (v: number) => `Rs ${Math.round(v).toLocaleString()}`
  const reasoning: string[] = []

  const swing =
    ctx.features.incomeVolatility <= 0.3
      ? 'barely moves from month to month'
      : ctx.features.incomeVolatility <= 0.6
        ? 'moves noticeably from month to month'
        : 'swings sharply from month to month'

  reasoning.push(
    `Average income is ${money(ctx.features.avgMonthlyInflow)} a month and the median month is ${money(ctx.features.medianMonthlyInflow)}, but income ${swing}. We underwrite against ${money(ctx.stressed)} — roughly a bad month — because that is the month an instalment has to survive.`,
  )

  reasoning.push(
    `Existing commitments we can see come to about ${money(ctx.committed)} a month, leaving ${money(ctx.disposableIncome)} genuinely spare in that bad month.`,
  )

  reasoning.push(
    `The binding limit is ${ctx.bindingRule.label.toLowerCase()}: ${ctx.bindingRule.explanation}`,
  )

  reasoning.push(
    `That supports an instalment of ${money(ctx.recommendedInstalment)} — ${Math.round((ctx.recommendedInstalment / Math.max(1, ctx.stressed)) * 100)}% of a bad month's income — which over ${ctx.tenor} months at ${Math.round(ctx.annualRate * 100)}% a year is a loan of ${money(ctx.recommendedAmount)}.`,
  )

  return reasoning
}

/**
 * What the offer looks like at each available tenor.
 *
 * Shown as a comparison because the trade-off is a real decision, not a
 * calculation: a longer term means a smaller instalment and a bigger loan, and
 * also more total interest and more months of exposure.
 */
export function tenorOptions(
  assessment: AffordabilityAssessment,
): { months: number; instalment: number; amount: number; totalRepayable: number; totalInterest: number }[] {
  // The amount-based rules (income multiple, product ceiling) do not relax
  // when the term lengthens, so they are re-applied at every tenor. Without
  // this, holding the instalment fixed and stretching the term would quietly
  // offer 5.5x monthly income under a rule that says 4x.
  const amountCap = Math.min(
    ...assessment.constraints
      .filter((c) => c.id === 'income_multiple' || c.id === 'absolute_cap')
      .map((c) => c.amountCeiling),
  )

  return AFFORDABILITY_POLICY.tenorOptions.map((months) => {
    const uncapped = principalFor(assessment.recommendedInstalment, assessment.annualRate, months)
    const amount = round(
      Math.min(uncapped, amountCap * (1 - AFFORDABILITY_POLICY.safetyMargin)),
      500,
    )
    const instalment = round(instalmentFor(amount, assessment.annualRate, months), 50)
    const totalRepayable = instalment * months
    return {
      months,
      instalment,
      amount,
      totalRepayable: round(totalRepayable),
      totalInterest: round(Math.max(0, totalRepayable - amount)),
    }
  })
}
