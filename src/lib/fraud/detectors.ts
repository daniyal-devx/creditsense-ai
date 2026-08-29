import type { CustomerFeatures, RawWalletTransaction } from '@/lib/features/types'

/**
 * FraudSense — anomaly detection over transaction behaviour.
 *
 * A framing that matters throughout this module: a fraud signal is not a
 * verdict. Every rule here answers "is this worth a human looking at?", never
 * "is this person a criminal". The output is a flag with evidence attached,
 * routed to a Fraud Analyst who decides. Automating the decision would mean
 * declining real applicants on a coincidence — two brothers sharing a phone
 * is the same signal as a device farm, and only a person can tell them apart.
 *
 * That is also why every flag carries the raw evidence that produced it. A
 * flag an analyst cannot check is a flag they will eventually learn to ignore.
 */

export type FraudSeverity = 'critical' | 'high' | 'medium' | 'low'

export type FraudFlagCode =
  | 'circular_transfers'
  | 'velocity_spike'
  | 'synthetic_activity'
  | 'shared_device'
  | 'shared_address'
  | 'thin_history_large_request'
  | 'income_inflation'
  | 'structuring'
  | 'dormant_reactivation'
  | 'counterparty_concentration'
  | 'round_amount_pattern'
  | 'ring_membership'

export interface FraudFlag {
  code: FraudFlagCode
  severity: FraudSeverity
  /** Short label for a badge. */
  label: string
  /** What was found, in plain language, with the numbers that triggered it. */
  finding: string
  /** Why this pattern is suspicious — the reasoning, not just the rule name. */
  rationale: string
  /** Points added to the fraud risk score, 0–100. */
  points: number
  /** The specific records that produced the flag, for the analyst to check. */
  evidence: Record<string, unknown>
}

export interface FraudAssessment {
  /** 0–100. Higher means more worth investigating. */
  riskScore: number
  level: 'clear' | 'review' | 'investigate' | 'block'
  flags: FraudFlag[]
  /** One sentence for the top of the application. */
  summary: string
  checkedAt: Date
}

const SEVERITY_POINTS: Record<FraudSeverity, number> = {
  critical: 40,
  high: 25,
  medium: 14,
  low: 6,
}

export interface FraudInput {
  customerId: string
  features: CustomerFeatures
  transactions: RawWalletTransaction[]
  /** Applicants sharing this customer's device fingerprint. */
  deviceMatches: { customerId: string; fullName: string; fingerprint: string }[]
  /** Applicants at the same address. */
  addressMatches: { customerId: string; fullName: string }[]
  /** Counterparty references this customer shares with other applicants. */
  sharedCounterparties: { ref: string; customerIds: string[] }[]
  walletOpenedAt: Date
  requestedAmount?: number
  declaredMonthlyIncome?: number | null
}

// ---------------------------------------------------------------------------
// Individual detectors
// ---------------------------------------------------------------------------

/**
 * Money that leaves and comes back.
 *
 * The signature of a ring manufacturing a transaction history: five accounts
 * pass the same funds around, and each one ends up looking busy and
 * well-funded without anybody having earned anything.
 *
 * Detected by matching outgoing and incoming transfers of a similar size
 * within a short window. A genuine two-way relationship — paying a supplier
 * who occasionally refunds you — produces a few of these; a ring produces
 * dozens, at similar amounts, on a rhythm.
 */
function detectCircularTransfers(input: FraudInput): FraudFlag | null {
  const transfers = input.transactions.filter(
    (t) => t.category === 'p2p_out' || t.category === 'p2p_in',
  )
  if (transfers.length < 6) return null

  const outgoing = transfers.filter((t) => t.direction === 'out')
  const incoming = transfers.filter((t) => t.direction === 'in')
  if (outgoing.length === 0 || incoming.length === 0) return null

  const WINDOW_MS = 72 * 60 * 60 * 1000
  const AMOUNT_TOLERANCE = 0.12

  let roundTrips = 0
  let roundTripValue = 0
  const matchedIncoming = new Set<number>()

  for (const out of outgoing) {
    for (let i = 0; i < incoming.length; i++) {
      if (matchedIncoming.has(i)) continue
      const inbound = incoming[i]
      const gap = Math.abs(inbound.occurredAt.getTime() - out.occurredAt.getTime())
      if (gap > WINDOW_MS) continue
      const relativeDiff = Math.abs(inbound.amount - out.amount) / Math.max(out.amount, 1)
      if (relativeDiff > AMOUNT_TOLERANCE) continue

      matchedIncoming.add(i)
      roundTrips++
      roundTripValue += out.amount
      break
    }
  }

  if (roundTrips < 5) return null

  const shareOfTransfers = roundTrips / Math.max(1, outgoing.length)
  const severity: FraudSeverity =
    roundTrips >= 15 && shareOfTransfers > 0.5
      ? 'critical'
      : roundTrips >= 8
        ? 'high'
        : 'medium'

  return {
    code: 'circular_transfers',
    severity,
    label: 'Circular transfers',
    finding: `${roundTrips} transfers left this wallet and came back at a near-identical amount within 72 hours, totalling Rs ${Math.round(roundTripValue).toLocaleString()}.`,
    rationale:
      'Money cycling out and back inflates apparent turnover without anyone earning anything. It is the standard way a coordinated group manufactures a transaction history for accounts that have none.',
    points: SEVERITY_POINTS[severity],
    evidence: {
      roundTrips,
      totalValue: Math.round(roundTripValue),
      shareOfOutgoingTransfers: Number(shareOfTransfers.toFixed(2)),
      windowHours: 72,
    },
  }
}

/**
 * A sudden burst of activity against the account's own baseline.
 *
 * Compared against the customer's own history rather than a population
 * average, because a shopkeeper's normal week would be an extraordinary one
 * for a freelancer. The question is whether *this* account changed.
 */
function detectVelocitySpike(input: FraudInput): FraudFlag | null {
  const { transactions } = input
  if (transactions.length < 30) return null

  const now = Date.now()
  const DAY = 86_400_000

  const recent = transactions.filter((t) => now - t.occurredAt.getTime() <= 14 * DAY)
  const baseline = transactions.filter((t) => {
    const age = now - t.occurredAt.getTime()
    return age > 14 * DAY && age <= 104 * DAY
  })

  if (baseline.length < 15 || recent.length < 5) return null

  const recentPerDay = recent.length / 14
  const baselinePerDay = baseline.length / 90
  if (baselinePerDay <= 0) return null

  const ratio = recentPerDay / baselinePerDay
  if (ratio < 3) return null

  const severity: FraudSeverity = ratio >= 6 ? 'high' : 'medium'

  return {
    code: 'velocity_spike',
    severity,
    label: 'Activity spike',
    finding: `Transaction rate is ${ratio.toFixed(1)}× this account's own normal — ${recentPerDay.toFixed(1)} a day over the last fortnight against ${baselinePerDay.toFixed(1)} historically.`,
    rationale:
      'A sharp burst just before an application often means an account being dressed up to look active. It can also be a genuine seasonal surge, which is why it is flagged for review rather than acted on.',
    points: SEVERITY_POINTS[severity],
    evidence: {
      recentPerDay: Number(recentPerDay.toFixed(2)),
      baselinePerDay: Number(baselinePerDay.toFixed(2)),
      ratio: Number(ratio.toFixed(2)),
    },
  }
}

/**
 * A history that looks manufactured rather than lived.
 *
 * Real spending is messy: irregular amounts, irregular gaps, a long tail of
 * small purchases. Synthetic history tends to be too tidy — evenly spaced,
 * suspiciously round, and concentrated in a few counterparties.
 */
function detectSyntheticActivity(input: FraudInput): FraudFlag | null {
  const { transactions, features } = input
  if (transactions.length < 25) return null

  const amounts = transactions.map((t) => t.amount)

  // Round amounts. Genuine spending produces 1,347 far more often than 5,000.
  const roundCount = amounts.filter((a) => a % 500 === 0).length
  const roundShare = roundCount / amounts.length

  // Even spacing. Real life is bursty; a bot is regular.
  const times = transactions.map((t) => t.occurredAt.getTime()).sort((a, b) => a - b)
  const gaps: number[] = []
  for (let i = 1; i < times.length; i++) gaps.push(times[i] - times[i - 1])

  const meanGap = gaps.reduce((a, b) => a + b, 0) / Math.max(1, gaps.length)
  const gapVariance =
    gaps.reduce((sum, g) => sum + (g - meanGap) ** 2, 0) / Math.max(1, gaps.length)
  // Coefficient of variation of the gaps. Below ~0.6 is unnaturally regular.
  const gapRegularity = meanGap > 0 ? Math.sqrt(gapVariance) / meanGap : 1

  const signals: string[] = []
  if (roundShare > 0.55) signals.push(`${Math.round(roundShare * 100)}% of amounts are round numbers`)
  if (gapRegularity < 0.6) signals.push('transactions are unnaturally evenly spaced')
  if (features.distinctIncomeSources <= 1 && features.transactionCount > 40) {
    signals.push('high activity but only one paying counterparty')
  }

  if (signals.length < 2) return null

  const severity: FraudSeverity = signals.length >= 3 ? 'high' : 'medium'

  return {
    code: 'synthetic_activity',
    severity,
    label: 'Synthetic-looking history',
    finding: `The transaction history looks constructed rather than lived: ${signals.join(', ')}.`,
    rationale:
      'Genuine spending is irregular in both amount and timing. History that is too tidy is a sign it was generated to pass a check rather than accumulated by living.',
    points: SEVERITY_POINTS[severity],
    evidence: {
      roundAmountShare: Number(roundShare.toFixed(2)),
      gapRegularity: Number(gapRegularity.toFixed(2)),
      distinctIncomeSources: features.distinctIncomeSources,
      signals,
    },
  }
}

/** Several applicants on one device. */
function detectSharedDevice(input: FraudInput): FraudFlag | null {
  if (input.deviceMatches.length === 0) return null

  const count = input.deviceMatches.length
  // Two people sharing a phone is common and usually innocent. Four or more
  // applying separately from one device is not.
  const severity: FraudSeverity = count >= 4 ? 'critical' : count >= 2 ? 'high' : 'medium'

  return {
    code: 'shared_device',
    severity,
    label: 'Shared device',
    finding: `${count} other ${count === 1 ? 'applicant applies' : 'applicants apply'} from the same device fingerprint: ${input.deviceMatches.map((m) => m.fullName).join(', ')}.`,
    rationale:
      'One device behind several applications is the most common signature of an organised ring. It is also what a shared family phone looks like, so it needs a human eye rather than an automatic decline.',
    points: SEVERITY_POINTS[severity],
    evidence: {
      fingerprint: input.deviceMatches[0]?.fingerprint,
      linkedCustomers: input.deviceMatches.map((m) => ({ id: m.customerId, name: m.fullName })),
    },
  }
}

/** Several applicants at one address. */
function detectSharedAddress(input: FraudInput): FraudFlag | null {
  if (input.addressMatches.length < 2) return null

  const count = input.addressMatches.length
  const severity: FraudSeverity = count >= 4 ? 'high' : 'medium'

  return {
    code: 'shared_address',
    severity,
    label: 'Shared address',
    finding: `${count} other applicants give the same address.`,
    rationale:
      'Multiple applications from one address may be a household, or may be an address being reused to manufacture identities. Read alongside the device and counterparty links before drawing a conclusion.',
    points: SEVERITY_POINTS[severity],
    evidence: {
      linkedCustomers: input.addressMatches.map((m) => ({ id: m.customerId, name: m.fullName })),
    },
  }
}

/** A large request against a very short history. */
function detectThinHistoryLargeRequest(input: FraudInput): FraudFlag | null {
  if (!input.requestedAmount) return null

  const tenure = input.features.walletTenureMonths
  const monthlyIncome = input.features.avgMonthlyInflow
  if (tenure > 6 || monthlyIncome <= 0) return null

  const multiple = input.requestedAmount / monthlyIncome
  if (multiple < 3) return null

  const severity: FraudSeverity = tenure <= 3 && multiple >= 5 ? 'high' : 'medium'

  return {
    code: 'thin_history_large_request',
    severity,
    label: 'Large request, short history',
    finding: `Requesting ${multiple.toFixed(1)}× monthly income on only ${tenure} months of wallet history.`,
    rationale:
      'A newly opened wallet paired with an outsized request is the shape of a bust-out: build just enough history to qualify, take the largest loan available, and disappear.',
    points: SEVERITY_POINTS[severity],
    evidence: {
      requestedAmount: input.requestedAmount,
      monthlyIncome: Math.round(monthlyIncome),
      incomeMultiple: Number(multiple.toFixed(2)),
      tenureMonths: tenure,
    },
  }
}

/** Declared income far above what the wallet shows. */
function detectIncomeInflation(input: FraudInput): FraudFlag | null {
  const declared = input.declaredMonthlyIncome
  const observed = input.features.avgMonthlyInflow
  if (!declared || declared <= 0 || observed <= 0) return null

  const ratio = declared / observed
  // Some overstatement is normal — people round up and count cash we cannot
  // see. Beyond about double, it stops being optimism.
  if (ratio < 2.2) return null

  const severity: FraudSeverity = ratio >= 4 ? 'high' : 'medium'

  return {
    code: 'income_inflation',
    severity,
    label: 'Overstated income',
    finding: `Declared income is Rs ${Math.round(declared).toLocaleString()} a month but observed earnings are Rs ${Math.round(observed).toLocaleString()} — ${ratio.toFixed(1)}× the difference.`,
    rationale:
      'Cash income we cannot observe explains a gap of perhaps half again. A multiple this large usually means the figure was chosen to qualify for an amount rather than reported.',
    points: SEVERITY_POINTS[severity],
    evidence: {
      declared: Math.round(declared),
      observed: Math.round(observed),
      ratio: Number(ratio.toFixed(2)),
    },
  }
}

/**
 * Payments broken into pieces to stay under a threshold.
 *
 * Classic structuring. Detected as clusters of similar amounts just below a
 * round figure, on the same day.
 */
function detectStructuring(input: FraudInput): FraudFlag | null {
  const outgoing = input.transactions.filter((t) => t.direction === 'out')
  if (outgoing.length < 12) return null

  const THRESHOLDS = [25_000, 50_000, 100_000]
  const byDay = new Map<string, RawWalletTransaction[]>()

  for (const tx of outgoing) {
    const day = tx.occurredAt.toISOString().slice(0, 10)
    const list = byDay.get(day)
    if (list) list.push(tx)
    else byDay.set(day, [tx])
  }

  let suspiciousDays = 0
  const examples: { day: string; count: number; total: number }[] = []

  for (const [day, txs] of byDay) {
    if (txs.length < 3) continue
    const total = txs.reduce((sum, t) => sum + t.amount, 0)

    // Several payments in a day, each just under a threshold, summing above it.
    for (const threshold of THRESHOLDS) {
      const justUnder = txs.filter((t) => t.amount >= threshold * 0.8 && t.amount < threshold)
      if (justUnder.length >= 3 && total > threshold) {
        suspiciousDays++
        examples.push({ day, count: justUnder.length, total: Math.round(total) })
        break
      }
    }
  }

  if (suspiciousDays < 2) return null

  return {
    code: 'structuring',
    severity: 'high',
    label: 'Possible structuring',
    finding: `On ${suspiciousDays} days, three or more payments were each just below a round threshold while the day's total went well above it.`,
    rationale:
      'Splitting a payment to stay under a reporting or verification threshold is deliberate. It rarely happens by accident on multiple days.',
    points: SEVERITY_POINTS.high,
    evidence: { suspiciousDays, examples: examples.slice(0, 5) },
  }
}

/** A long-dormant wallet waking up right before an application. */
function detectDormantReactivation(input: FraudInput): FraudFlag | null {
  const { features, transactions } = input
  if (features.longestDormancyDays < 60) return null
  if (transactions.length < 10) return null

  const now = Date.now()
  const recentCount = transactions.filter(
    (t) => now - t.occurredAt.getTime() <= 21 * 86_400_000,
  ).length

  // Dormant for a long stretch, then suddenly busy.
  if (recentCount < 8) return null

  return {
    code: 'dormant_reactivation',
    severity: 'medium',
    label: 'Dormant then reactivated',
    finding: `The wallet was inactive for ${features.longestDormancyDays} days at a stretch, then produced ${recentCount} transactions in the last three weeks.`,
    rationale:
      'An account revived shortly before an application may be an old identity being reused, or simply someone returning to work. The pattern is worth a look either way.',
    points: SEVERITY_POINTS.medium,
    evidence: {
      longestDormancyDays: features.longestDormancyDays,
      recentTransactions: recentCount,
    },
  }
}

/** Counterparties shared with other applicants. */
function detectCounterpartyConcentration(input: FraudInput): FraudFlag | null {
  const shared = input.sharedCounterparties.filter((c) => c.customerIds.length >= 3)
  if (shared.length < 2) return null

  const severity: FraudSeverity = shared.length >= 4 ? 'high' : 'medium'

  return {
    code: 'counterparty_concentration',
    severity,
    label: 'Shared counterparties',
    finding: `${shared.length} counterparties are shared with three or more other applicants.`,
    rationale:
      'A common merchant is expected. A cluster of applicants transacting with the same handful of private counterparties suggests the money is moving inside a closed group.',
    points: SEVERITY_POINTS[severity],
    evidence: {
      sharedCounterparties: shared.slice(0, 6).map((c) => ({
        ref: c.ref,
        linkedApplicants: c.customerIds.length,
      })),
    },
  }
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

const DETECTORS: ((input: FraudInput) => FraudFlag | null)[] = [
  detectCircularTransfers,
  detectSharedDevice,
  detectSyntheticActivity,
  detectStructuring,
  detectVelocitySpike,
  detectSharedAddress,
  detectThinHistoryLargeRequest,
  detectIncomeInflation,
  detectDormantReactivation,
  detectCounterpartyConcentration,
]

export function assessFraud(input: FraudInput): FraudAssessment {
  const flags: FraudFlag[] = []

  for (const detector of DETECTORS) {
    try {
      const flag = detector(input)
      if (flag) flags.push(flag)
    } catch (err) {
      // One detector throwing must never suppress the others — a fraud check
      // that silently returns "clear" because of a bug is worse than no check.
      console.error(`[fraud] detector failed for ${input.customerId}:`, err)
    }
  }

  flags.sort((a, b) => b.points - a.points)

  const rawScore = flags.reduce((sum, f) => sum + f.points, 0)

  // Saturating rather than linear: the difference between three flags and four
  // matters much less than the difference between none and one, and a linear
  // sum would let a handful of low-severity flags out-score one critical.
  const riskScore = Math.min(100, Math.round(100 * (1 - Math.exp(-rawScore / 45))))

  const level: FraudAssessment['level'] =
    flags.some((f) => f.severity === 'critical') || riskScore >= 70
      ? 'block'
      : riskScore >= 45
        ? 'investigate'
        : riskScore >= 20
          ? 'review'
          : 'clear'

  return {
    riskScore,
    level,
    flags,
    summary: buildSummary(flags, level),
    checkedAt: new Date(),
  }
}

/**
 * Fold cluster membership back into an individual assessment.
 *
 * The detectors above look at each applicant alone, which misses the thing
 * that matters most about a ring: belonging to one is itself evidence. A
 * member who is careful — a slightly different device fingerprint, fewer
 * circular transfers — can score just under the threshold and be waved
 * through, while the group around them is obviously coordinated. In the first
 * run against the planted ring that is exactly what happened: five of six were
 * caught and the sixth scored 43 against a threshold of 45.
 *
 * Real investigators do not work that way. Once a cluster is established, the
 * question becomes "who is in it", and every member is looked at. This applies
 * that: the graph is built after the individual pass, and membership of a
 * serious cluster is added as a flag in its own right.
 *
 * It is still a flag, not a verdict. A shared household lands here too, which
 * is why the finding names the cluster's evidence rather than asserting fraud.
 */
export function withClusterMembership(
  assessment: FraudAssessment,
  cluster: {
    memberCount: number
    severity: 'critical' | 'high' | 'medium' | 'low'
    linkTypes: string[]
    assessment: string
  } | null,
): FraudAssessment {
  if (!cluster || cluster.severity === 'low') return assessment

  const severity: FraudSeverity =
    cluster.severity === 'critical' ? 'critical' : cluster.severity === 'high' ? 'high' : 'medium'

  const flag: FraudFlag = {
    code: 'ring_membership',
    severity,
    label: 'Part of a connected group',
    finding: `Belongs to a group of ${cluster.memberCount} applicants linked by ${cluster.linkTypes.join(', ').replace(/_/g, ' ')}.`,
    rationale: cluster.assessment,
    points: SEVERITY_POINTS[severity],
    evidence: {
      clusterSize: cluster.memberCount,
      linkTypes: cluster.linkTypes,
      clusterSeverity: cluster.severity,
    },
  }

  // Rebuilt through the same scoring path rather than patched, so an
  // augmented assessment is indistinguishable from one produced directly.
  const flags = [...assessment.flags, flag].sort((a, b) => b.points - a.points)
  const rawScore = flags.reduce((sum, f) => sum + f.points, 0)
  const riskScore = Math.min(100, Math.round(100 * (1 - Math.exp(-rawScore / 45))))

  const level: FraudAssessment['level'] =
    flags.some((f) => f.severity === 'critical') || riskScore >= 70
      ? 'block'
      : riskScore >= 45
        ? 'investigate'
        : riskScore >= 20
          ? 'review'
          : 'clear'

  return {
    ...assessment,
    flags,
    riskScore,
    level,
    summary: buildSummary(flags, level),
  }
}

function buildSummary(flags: FraudFlag[], level: FraudAssessment['level']): string {
  if (flags.length === 0) {
    return 'No fraud signals found. Nothing in the transaction behaviour, device or identity checks looks out of place.'
  }

  const top = flags.slice(0, 2).map((f) => f.label.toLowerCase())
  const count = flags.length

  const opening =
    level === 'block'
      ? 'Do not decide this application without a fraud review.'
      : level === 'investigate'
        ? 'This application needs a fraud analyst to look at it.'
        : 'Minor fraud signals worth noting.'

  return `${opening} ${count} ${count === 1 ? 'signal' : 'signals'} found, led by ${top.join(' and ')}.`
}

export const FRAUD_LEVEL_LABELS: Record<FraudAssessment['level'], string> = {
  clear: 'No fraud signals',
  review: 'Minor signals',
  investigate: 'Needs investigation',
  block: 'Do not decide without review',
}
