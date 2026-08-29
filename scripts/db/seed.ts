/**
 * Seed the database with a synthetic Pakistani informal-worker population.
 *
 *   npm run db:seed              generate and load
 *   npm run db:seed -- --wipe    delete existing data first
 *
 * Everything is driven by one seeded RNG, so the same command always produces
 * the same population — a demo script that quotes a score stays true, and a
 * bug in the feature engine can actually be reproduced.
 *
 * Three narratives are planted deliberately, because the product's whole claim
 * only lands if the data can show it:
 *
 *   1. The thin-file hero — strong behaviour, zero bureau file. A bank rejects
 *      her; CreditSense approves her.
 *   2. The deterioration case — approved on good signals, income collapses
 *      afterwards. Phase 6 has to catch it before the default.
 *   3. The fraud ring — several applications sharing devices and cycling money
 *      between themselves. Phase 5 has to surface the cluster.
 */
import { randomUUID } from 'node:crypto'
import { Client } from 'pg'
import { bulkInsert, progress } from './lib/bulk'
import { loadEnv, migrationConnectionString } from './env'
import {
  CITIES,
  EDUCATION_LEVELS,
  FEMALE_FIRST_NAMES,
  FREELANCE_CLIENTS,
  INTERNET_PROVIDERS,
  LAST_NAMES,
  MALE_FIRST_NAMES,
  MERCHANTS,
  MOBILE_NETWORKS,
  SUPPLIERS,
  makeCnic,
  makePhone,
  type CityInfo,
} from './lib/pakistan'
import {
  PERSONAS,
  TIERS,
  TIER_DEFAULT_RATE,
  type PersonaId,
  type QualityTier,
} from './lib/personas'
import {
  Rng,
  addDays,
  addMonths,
  atLocalTime,
  daysBetween,
  startOfMonth,
  toDateString,
} from './lib/random'

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const SEED = 'creditsense-2026'
const REGULAR_CUSTOMERS = 62
const FRAUD_RING_SIZE = 5
const MONTHS_OF_HISTORY = 14

/**
 * "Now" for the generated world. Anchored to the real clock so the demo always
 * shows recent activity, but truncated to midnight so a re-run on the same day
 * produces identical data.
 */
const NOW = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z')
const WINDOW_START = startOfMonth(addMonths(NOW, -MONTHS_OF_HISTORY))

const rng = new Rng(SEED)

// ---------------------------------------------------------------------------
// Row shapes
// ---------------------------------------------------------------------------

interface CustomerRow {
  id: string
  full_name: string
  cnic: string
  phone: string
  email: string | null
  date_of_birth: string
  gender: 'male' | 'female'
  city: string
  province: string
  address: string
  occupation: string
  persona: PersonaId
  employment_type: string
  declared_monthly_income: number
  household_size: number
  dependents: number
  education_level: string
  primary_wallet: string
  wallet_opened_at: string
  device_fingerprint: string
  sim_registered_at: string
  has_bank_loan_history: boolean
  bureau_score: number | null
}

/** Generation-time context that never reaches the database. */
interface CustomerPlan {
  row: CustomerRow
  city: CityInfo
  persona: PersonaId
  tier: QualityTier
  /** Ground truth for Phase 3 training. */
  willDefault: boolean
  baseMonthlyIncome: number
  incomeTrend: number
  volatility: number
  billOnTimeRate: number
  billUnpaidRate: number
  latenessRange: [number, number]
  incomeGapRate: number
  savingsRate: number
  topupRegularity: number
  cashOutPropensity: number
  observationStart: Date
  /** Set for the planted narratives so later phases can find them. */
  narrative?: 'thin_file_hero' | 'deterioration' | 'fraud_ring'
  /** Month index (from observationStart) where income collapses. */
  collapseFromMonth?: number
  isPostpaid: boolean
  network: string
}

type WalletRow = [
  customer_id: string,
  provider: string,
  direction: string,
  category: string,
  amount: number,
  balance_after: number,
  counterparty_ref: string | null,
  counterparty_name: string | null,
  description: string | null,
  occurred_at: Date,
]

type TopupRow = [
  customer_id: string,
  network: string,
  amount: number,
  product_type: string,
  is_recurring: boolean,
  occurred_at: Date,
]

type BillRow = [
  customer_id: string,
  biller_type: string,
  biller_name: string,
  billing_month: string,
  due_date: string,
  amount_due: number,
  paid_at: Date | null,
  amount_paid: number | null,
  status: string,
]

// ---------------------------------------------------------------------------
// Customer generation
// ---------------------------------------------------------------------------

let cnicSerial = 1_000_000
let phoneSerial = 2_000_000

/**
 * Names must be unique across the population.
 *
 * Two customers called "Ayesha Siddiqui" — one of them the demo's thin-file
 * hero and the other a distressed borrower — is the kind of detail that
 * derails a live demo when the wrong row gets clicked.
 */
const usedNames = new Set<string>()

function uniqueName(gender: 'male' | 'female'): string {
  const pool = gender === 'male' ? MALE_FIRST_NAMES : FEMALE_FIRST_NAMES
  for (let attempt = 0; attempt < 200; attempt++) {
    const candidate = `${rng.pick(pool)} ${rng.pick(LAST_NAMES)}`
    if (!usedNames.has(candidate)) {
      usedNames.add(candidate)
      return candidate
    }
  }
  // The name space is ~35 x 30 per gender, so this is unreachable at our
  // population size — but silently shipping a duplicate would be worse.
  const fallback = `${rng.pick(pool)} ${rng.pick(LAST_NAMES)} ${usedNames.size}`
  usedNames.add(fallback)
  return fallback
}

function makeCustomer(options: {
  persona?: PersonaId
  tier?: QualityTier
  city?: CityInfo
  device?: string
  walletAgeMonths?: number
  narrative?: CustomerPlan['narrative']
}): CustomerPlan {
  const city = options.city ?? rng.weighted(CITIES.map((c) => [c, c.weight] as const))
  const persona = options.persona ?? rng.pick(Object.keys(PERSONAS) as PersonaId[])
  const tier =
    options.tier ??
    rng.weighted((Object.keys(TIERS) as QualityTier[]).map((t) => [t, TIERS[t].weight] as const))

  const personaModel = PERSONAS[persona]
  const tierModel = TIERS[tier]

  const gender: 'male' | 'female' = rng.chance(0.62) ? 'male' : 'female'
  const fullName = uniqueName(gender)
  const [firstName, lastName] = fullName.split(' ')

  const age = rng.int(21, 52)
  const dob = new Date(
    Date.UTC(NOW.getUTCFullYear() - age, rng.int(0, 11), rng.int(1, 28)),
  )

  const network = rng.pick(MOBILE_NETWORKS)
  const phone = makePhone(rng.pick(network.prefixes), phoneSerial++)
  const cnic = makeCnic(rng.pick(city.cnicPrefixes), cnicSerial++, gender)

  // Wallet tenure is a first-class signal, so it is generated explicitly
  // rather than falling out of the transaction history.
  const walletAgeMonths = options.walletAgeMonths ?? rng.int(9, 62)
  const walletOpened = addDays(addMonths(NOW, -walletAgeMonths), rng.int(0, 27))

  // We can only observe behaviour from whichever is later: the start of our
  // window, or the day they opened the wallet.
  const observationStart = walletOpened > WINDOW_START ? walletOpened : WINDOW_START

  const incomeMultiplier = rng.float(...tierModel.incomeMultiplier)
  const baseMonthlyIncome = personaModel.medianMonthlyIncome * incomeMultiplier

  // A default label is drawn from the tier's base rate. This is the ground
  // truth Phase 3 trains against.
  const willDefault = rng.chance(TIER_DEFAULT_RATE[tier])

  const householdSize = rng.int(2, 9)

  const row: CustomerRow = {
    id: randomUUID(),
    full_name: fullName,
    cnic,
    phone,
    email: rng.chance(0.55)
      ? `${firstName.toLowerCase()}.${lastName.toLowerCase()}${rng.int(1, 99)}@gmail.com`
      : null,
    date_of_birth: toDateString(dob),
    gender,
    city: city.name,
    province: city.province,
    address: `House ${rng.int(1, 480)}, Street ${rng.int(1, 40)}, ${rng.pick([
      'Gulshan', 'Model Town', 'Saddar', 'Johar Town', 'North Nazimabad',
      'Bahria Town', 'DHA Phase 2', 'Garden Town', 'Satellite Town',
    ])}, ${city.name}`,
    occupation: rng.pick(personaModel.occupations),
    persona,
    employment_type: rng.weighted([
      ['self_employed', 40],
      ['gig', 25],
      ['micro_business', 25],
      ['informal_salaried', 10],
    ]),
    // What they claim. Applicants round up and over-state — the gap between
    // this and observed inflow is itself a signal the model can use.
    declared_monthly_income: rng.money(baseMonthlyIncome * rng.float(1.0, 1.35), 500),
    household_size: householdSize,
    dependents: rng.int(0, householdSize - 1),
    education_level: rng.pick(EDUCATION_LEVELS),
    primary_wallet: rng.weighted([
      ['easypaisa', 40],
      ['jazzcash', 42],
      ['raast', 18],
    ]),
    wallet_opened_at: toDateString(walletOpened),
    device_fingerprint: options.device ?? `dev_${rng.int(100000, 999999).toString(36)}${rng.int(1000, 9999)}`,
    sim_registered_at: toDateString(addDays(walletOpened, -rng.int(30, 900))),
    // The core premise: these people are invisible to a bureau. A small
    // minority have some history, which gives the model a contrast group.
    has_bank_loan_history: rng.chance(0.14),
    bureau_score: null,
  }

  // Only the few with bank history have a bureau score at all.
  if (row.has_bank_loan_history) {
    row.bureau_score = rng.int(420, 780)
  }

  return {
    row,
    city,
    persona,
    tier,
    willDefault,
    baseMonthlyIncome,
    incomeTrend: rng.float(...tierModel.incomeTrend),
    volatility: personaModel.incomeSigma * rng.float(...tierModel.volatilityMultiplier),
    billOnTimeRate: rng.float(...tierModel.billOnTimeRate),
    billUnpaidRate: rng.float(...tierModel.billUnpaidRate),
    latenessRange: tierModel.latenessDays,
    incomeGapRate: rng.float(...tierModel.incomeGapRate),
    savingsRate: rng.float(...tierModel.savingsRate),
    topupRegularity: rng.float(...tierModel.topupRegularity),
    cashOutPropensity: rng.float(...personaModel.cashOutPropensity),
    observationStart,
    narrative: options.narrative,
    isPostpaid: rng.chance(0.12),
    network: network.id,
  }
}

// ---------------------------------------------------------------------------
// Behaviour generation for one customer
// ---------------------------------------------------------------------------

interface GeneratedActivity {
  wallet: WalletRow[]
  topups: TopupRow[]
  bills: BillRow[]
}

/**
 * Split `total` into `count` transaction amounts that still add up to `total`.
 *
 * The weights make the individual amounts look like real transactions rather
 * than `total / count` repeated; normalising by the weight sum is what keeps
 * the category's events adding up to the budget it was allocated. Generating
 * each amount independently around an average is how the earlier version ended
 * up spending ~30% more than anyone earned.
 */
function distribute(total: number, count: number, roundTo = 10): number[] {
  if (count <= 0 || total <= 0) return []
  const weights = Array.from({ length: count }, () => rng.float(0.45, 1.75))
  const weightSum = weights.reduce((a, b) => a + b, 0)
  return weights.map((w) => rng.money((total * w) / weightSum, roundTo))
}

function generateActivity(plan: CustomerPlan): GeneratedActivity {
  const persona = PERSONAS[plan.persona]
  const wallet: WalletRow[] = []
  const topups: TopupRow[] = []
  const bills: BillRow[] = []

  const monthCount = Math.max(
    1,
    Math.ceil(daysBetween(plan.observationStart, NOW) / 30.44),
  )

  /**
   * Which utilities this household actually has, and what they cost.
   *
   * Bill amounts are a share of income, not an absolute draw. Drawing them
   * independently produced households whose electricity bill alone exceeded
   * their monthly earnings — which pushed the whole population's savings rate
   * negative and would have told Phase 4 that nobody in the country can
   * service a loan. A floor keeps the small ones realistic: a meter reading
   * has a minimum charge regardless of what the customer earns.
   */
  const income = plan.baseMonthlyIncome
  const utilityBase = (share: [number, number], floor: number) =>
    Math.max(floor, income * rng.float(share[0], share[1]))

  const utilities: { type: string; name: string; base: number }[] = [
    {
      type: 'electricity',
      name: plan.city.electricityBiller,
      base: utilityBase([0.045, 0.095], 1400),
    },
  ]
  if (rng.chance(0.78)) {
    utilities.push({
      type: 'gas',
      name: plan.city.gasBiller,
      base: utilityBase([0.012, 0.032], 600),
    })
  }
  if (plan.city.waterBiller && rng.chance(0.42)) {
    utilities.push({
      type: 'water',
      name: plan.city.waterBiller,
      base: utilityBase([0.004, 0.011], 280),
    })
  }
  if (rng.chance(0.5)) {
    utilities.push({
      type: 'internet',
      name: rng.pick(INTERNET_PROVIDERS),
      base: utilityBase([0.018, 0.042], 1500),
    })
  }
  if (plan.isPostpaid) {
    const net = MOBILE_NETWORKS.find((n) => n.id === plan.network)!
    utilities.push({
      type: 'mobile_postpaid',
      name: `${net.name} Postpaid`,
      base: utilityBase([0.01, 0.028], 800),
    })
  }

  // A handful of recurring counterparties — a real person pays the same shop
  // and receives from the same clients, which is what makes a relationship
  // graph meaningful in Phase 5.
  const regularPayers = Array.from({ length: rng.int(2, 6) }, () => ({
    ref: `cp_${rng.int(100000, 999999).toString(36)}`,
    name:
      plan.persona === 'freelancer'
        ? rng.pick(FREELANCE_CLIENTS)
        : `Customer ${rng.int(1, 9999)}`,
  }))
  const supplier = persona.hasSupplierCosts
    ? { ref: `sup_${rng.int(10000, 99999).toString(36)}`, name: rng.pick(SUPPLIERS) }
    : null

  let balance = rng.float(2000, 25000)

  for (let m = 0; m < monthCount; m++) {
    const monthStart = startOfMonth(addMonths(plan.observationStart, m))
    if (monthStart > NOW) break

    const monthEnd = addDays(startOfMonth(addMonths(monthStart, 1)), -1)
    const effectiveEnd = monthEnd > NOW ? NOW : monthEnd
    const daysInMonth = Math.max(1, daysBetween(monthStart, effectiveEnd) + 1)
    const isPartialMonth = daysInMonth < 26

    // ---- how much they earn this month ----
    const trendFactor = Math.pow(plan.incomeTrend, m)
    const calendarMonth = monthStart.getUTCMonth() + 1
    const seasonal = persona.seasonalPeakMonths.includes(calendarMonth) ? persona.seasonalUplift : 1

    let target = rng.logNormal(plan.baseMonthlyIncome * trendFactor * seasonal, plan.volatility)

    // A bad month: work dried up.
    if (rng.chance(plan.incomeGapRate)) target *= rng.float(0.05, 0.3)

    // The deterioration narrative: income falls off a cliff partway through.
    if (plan.collapseFromMonth !== undefined && m >= plan.collapseFromMonth) {
      const monthsSince = m - plan.collapseFromMonth
      target *= Math.max(0.12, Math.pow(0.55, monthsSince + 1))
    }

    // Pro-rate the current, incomplete month so it does not look like a crash.
    if (isPartialMonth) target *= daysInMonth / 30.44

    const monthlyIncome = Math.max(0, target)
    const partialFactor = isPartialMonth ? daysInMonth / 30.44 : 1

    const monthEvents: { at: Date; row: WalletRow }[] = []
    const randomDay = () => addDays(monthStart, rng.int(0, Math.max(0, daysInMonth - 1)))

    // ---- income events ----
    const incomeCount = Math.max(1, Math.round(rng.int(...persona.incomeEventsPerMonth) * partialFactor))

    for (const amount of distribute(monthlyIncome, incomeCount, 10)) {
      if (amount < 50) continue
      const at = atLocalTime(rng, randomDay(), 9, 21)
      const payer = rng.chance(0.6) ? rng.pick(regularPayers) : null
      monthEvents.push({
        at,
        row: [
          plan.row.id,
          plan.row.primary_wallet,
          'in',
          persona.incomeCategory,
          amount,
          0,
          payer?.ref ?? null,
          payer?.name ??
            (plan.persona === 'freelancer'
              ? rng.pick(FREELANCE_CLIENTS)
              : `Customer ${rng.int(1, 9999)}`),
          plan.persona === 'freelancer' ? 'Client payment received' : 'Sale received',
          at,
        ],
      })
    }

    // =========================================================================
    // Outflow budget.
    //
    // Everything leaving the wallet has to add up to what they actually spend,
    // which is income minus what they keep. Deriving each outflow category from
    // its own independent share of income made those shares sum to well over
    // 100%, so total outflow exceeded income for the entire population and the
    // savings rate came out around -89%. Phase 4 sizes a loan from exactly that
    // number, so it would have concluded that nobody can afford to borrow
    // anything.
    //
    // The fix is to budget properly: fixed obligations first, then split
    // whatever is left between cash and discretionary spending.
    // =========================================================================
    const spendBudget = monthlyIncome * (1 - plan.savingsRate)

    // ---- fixed obligation: utility bills ----
    let billsPaidThisMonth = 0

    for (const utility of utilities) {
      const billingMonth = monthStart
      const dueDate = addDays(billingMonth, rng.int(18, 24))

      // Electricity swings hard with the season in Pakistan — air conditioning
      // in summer, almost nothing in winter.
      const seasonalFactor =
        utility.type === 'electricity'
          ? [12, 1, 2].includes(calendarMonth)
            ? rng.float(0.5, 0.75)
            : [5, 6, 7, 8].includes(calendarMonth)
              ? rng.float(1.4, 2.1)
              : rng.float(0.85, 1.2)
          : rng.float(0.9, 1.12)

      const amountDue = rng.money(utility.base * seasonalFactor, 10)

      // The bill has not come due yet, so there is nothing to judge.
      if (dueDate > NOW) continue

      let status: string
      let paidAt: Date | null
      let amountPaid: number | null

      if (rng.chance(plan.billUnpaidRate)) {
        status = 'unpaid'
        paidAt = null
        amountPaid = null
      } else if (rng.chance(plan.billOnTimeRate)) {
        status = 'paid_on_time'
        paidAt = atLocalTime(rng, addDays(dueDate, -rng.int(0, 9)), 9, 20)
        amountPaid = amountDue
      } else {
        const lateDays = rng.int(...plan.latenessRange)
        const when = addDays(dueDate, lateDays)
        if (when > NOW) {
          // Late, and still unpaid because that date has not arrived yet.
          status = 'unpaid'
          paidAt = null
          amountPaid = null
        } else {
          status = 'paid_late'
          paidAt = atLocalTime(rng, when, 9, 21)
          amountPaid = amountDue
        }
      }

      bills.push([
        plan.row.id,
        utility.type,
        utility.name,
        toDateString(billingMonth),
        toDateString(dueDate),
        amountDue,
        paidAt,
        amountPaid,
        status,
      ])

      // A paid bill also shows up as money leaving the wallet.
      if (paidAt) {
        billsPaidThisMonth += amountDue
        monthEvents.push({
          at: paidAt,
          row: [
            plan.row.id,
            plan.row.primary_wallet,
            'out',
            'bill_payment',
            amountDue,
            0,
            `biller_${utility.type}`,
            utility.name,
            `${utility.type} bill`,
            paidAt,
          ],
        })
      }
    }

    // ---- fixed obligation: mobile top-ups ----
    let topupTotal = 0

    if (!plan.isPostpaid) {
      const expected = rng.int(2, 5)
      const actual = Math.max(0, Math.round(expected * plan.topupRegularity * partialFactor))

      for (let t = 0; t < actual; t++) {
        const amount = rng.money(
          rng.weighted([[100, 3], [200, 4], [300, 3], [500, 3], [1000, 2]]),
          50,
        )
        const at = atLocalTime(rng, randomDay(), 8, 22)
        const isRecurring = plan.topupRegularity > 0.8 && rng.chance(0.5)
        topupTotal += amount

        topups.push([
          plan.row.id,
          plan.network,
          amount,
          rng.weighted([['airtime', 5], ['data_bundle', 4], ['call_package', 2], ['hybrid_bundle', 2]]),
          isRecurring,
          at,
        ])

        monthEvents.push({
          at,
          row: [
            plan.row.id,
            plan.row.primary_wallet,
            'out',
            'mobile_topup',
            amount,
            0,
            `net_${plan.network}`,
            MOBILE_NETWORKS.find((n) => n.id === plan.network)?.name ?? plan.network,
            'Mobile top-up',
            at,
          ],
        })
      }
    }

    // ---- business cost of earning: stock for a shop, fuel for a driver ----
    let supplierTotal = 0

    if (supplier) {
      const costRatio = plan.persona === 'driver' ? rng.float(0.18, 0.3) : rng.float(0.28, 0.45)
      supplierTotal = monthlyIncome * costRatio
      const costEvents = Math.max(
        1,
        Math.round((plan.persona === 'driver' ? rng.int(8, 16) : rng.int(2, 5)) * partialFactor),
      )

      for (const amount of distribute(supplierTotal, costEvents, 10)) {
        if (amount < 50) continue
        const at = atLocalTime(rng, randomDay(), 7, 21)
        monthEvents.push({
          at,
          row: [
            plan.row.id,
            plan.row.primary_wallet,
            'out',
            'purchase',
            amount,
            0,
            supplier.ref,
            plan.persona === 'driver'
              ? rng.pick(['PSO Filling Station', 'Shell Pakistan', 'Total Parco'])
              : supplier.name,
            plan.persona === 'driver' ? 'Fuel' : 'Stock purchase',
            at,
          ],
        })
      }
    }

    // ---- whatever is left after the obligations ----
    // This can legitimately come out near zero for a distressed customer whose
    // bills alone eat the month — that is what being distressed looks like in
    // the data. The floor stops it going negative and producing nonsense.
    const remaining = Math.max(
      monthlyIncome * 0.02,
      spendBudget - billsPaidThisMonth - topupTotal - supplierTotal,
    )

    const cashOutBudget = remaining * plan.cashOutPropensity
    const discretionaryBudget = remaining - cashOutBudget

    // ---- cash withdrawals ----
    const cashOutCount = Math.max(1, Math.round(rng.int(1, 4) * partialFactor))
    for (const amount of distribute(cashOutBudget, cashOutCount, 100)) {
      if (amount < 500) continue
      const at = atLocalTime(rng, randomDay(), 9, 22)
      monthEvents.push({
        at,
        row: [
          plan.row.id,
          plan.row.primary_wallet,
          'out',
          'cash_out',
          amount,
          0,
          null,
          'Agent withdrawal',
          'Cash withdrawal',
          at,
        ],
      })
    }

    // ---- discretionary spending ----
    const spendCount = Math.max(
      1,
      Math.round(rng.int(...persona.spendEventsPerMonth) * partialFactor),
    )
    for (const amount of distribute(discretionaryBudget, spendCount, 10)) {
      if (amount < 50) continue
      const at = atLocalTime(rng, randomDay(), 8, 23)
      monthEvents.push({
        at,
        row: [
          plan.row.id,
          plan.row.primary_wallet,
          'out',
          rng.chance(0.25) ? 'p2p_out' : 'purchase',
          amount,
          0,
          null,
          rng.pick(MERCHANTS),
          'Payment',
          at,
        ],
      })
    }

    // ---- settle the month: order events and track the running balance ----
    monthEvents.sort((a, b) => a.at.getTime() - b.at.getTime())
    for (const event of monthEvents) {
      const [, , direction, , amount] = event.row
      balance += direction === 'in' ? (amount as number) : -(amount as number)
      // A wallet cannot go negative; when it would, the person simply could
      // not have made that payment digitally.
      if (balance < 0) balance = rng.float(0, 400)
      event.row[5] = rng.money(balance, 1)
      wallet.push(event.row)
    }
  }

  return { wallet, topups, bills }
}

// ---------------------------------------------------------------------------
// Applications, loans and repayments
// ---------------------------------------------------------------------------

const LOAN_PURPOSES = [
  'Working capital for shop inventory',
  'Motorcycle purchase',
  'Home repairs',
  'Medical expenses',
  'School fees',
  'Equipment purchase',
  'Business expansion',
  'Wedding expenses',
  'Debt consolidation',
  'Emergency expenses',
]

let applicationSerial = 1
let loanSerial = 1

function applicationReference(): string {
  return `APP-${NOW.getUTCFullYear()}-${String(applicationSerial++).padStart(5, '0')}`
}

function loanReference(): string {
  return `LN-${NOW.getUTCFullYear()}-${String(loanSerial++).padStart(5, '0')}`
}

interface LoanBundle {
  loan: unknown[]
  repayments: unknown[][]
}

/** A flat instalment schedule, which is what microfinance in Pakistan actually uses. */
function buildLoan(plan: CustomerPlan, applicationId: string | null, opts: {
  principal: number
  tenor: number
  disbursedAt: Date
  outcome: 'clean' | 'late' | 'default'
}): LoanBundle {
  const annualRate = rng.float(0.24, 0.42)
  const totalRepayable = opts.principal * (1 + (annualRate * opts.tenor) / 12)
  const instalment = rng.money(totalRepayable / opts.tenor, 10)

  const firstDue = addMonths(opts.disbursedAt, 1)
  const maturity = addMonths(opts.disbursedAt, opts.tenor)
  const loanId = randomUUID()

  const repayments: unknown[][] = []
  let paidCount = 0
  let missedRun = 0
  let outstanding = totalRepayable

  for (let i = 1; i <= opts.tenor; i++) {
    const dueDate = addMonths(firstDue, i - 1)

    // Instalments in the future have simply not happened yet.
    if (dueDate > NOW) {
      repayments.push([loanId, plan.row.id, i, toDateString(dueDate), instalment, null, null, null, 'due'])
      continue
    }

    let status: string
    let paidAt: Date | null = null
    let amountPaid: number | null = null
    let daysLate: number | null = null

    if (opts.outcome === 'default' && missedRun >= 0 && i > Math.ceil(opts.tenor * 0.35)) {
      // Once a defaulting borrower stops paying, they stop for good.
      status = 'missed'
      missedRun++
    } else if (opts.outcome === 'clean' ? rng.chance(0.93) : rng.chance(0.68)) {
      status = 'paid_on_time'
      paidAt = atLocalTime(rng, addDays(dueDate, -rng.int(0, 4)), 9, 20)
      amountPaid = instalment
      daysLate = Math.min(0, daysBetween(dueDate, paidAt))
      paidCount++
      outstanding -= instalment
    } else {
      const late = rng.int(3, 28)
      const when = addDays(dueDate, late)
      if (when > NOW) {
        status = 'due'
      } else {
        status = 'paid_late'
        paidAt = atLocalTime(rng, when, 9, 21)
        amountPaid = instalment
        daysLate = late
        paidCount++
        outstanding -= instalment
      }
    }

    repayments.push([
      loanId,
      plan.row.id,
      i,
      toDateString(dueDate),
      instalment,
      paidAt,
      amountPaid,
      daysLate,
      status,
    ])
  }

  const allDue = maturity <= NOW
  const status =
    opts.outcome === 'default'
      ? missedRun >= 3
        ? 'defaulted'
        : 'delinquent'
      : allDue && paidCount >= opts.tenor
        ? 'closed'
        : 'active'

  return {
    loan: [
      loanId,
      plan.row.id,
      applicationId,
      loanReference(),
      opts.principal,
      opts.tenor,
      annualRate.toFixed(4),
      instalment,
      opts.disbursedAt,
      toDateString(firstDue),
      toDateString(maturity),
      status,
      Math.max(0, rng.money(outstanding, 1)),
    ],
    repayments,
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  loadEnv()
  const wipe = process.argv.includes('--wipe')

  console.log('\n  CreditSense AI — seeding the synthetic population')
  console.log(`  seed="${SEED}"  window=${toDateString(WINDOW_START)} → ${toDateString(NOW)}\n`)

  const client = new Client({
    connectionString: migrationConnectionString(),
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 20_000,
  })
  await client.connect()

  try {
    const { rows: existing } = await client.query<{ count: string }>(
      'select count(*)::text as count from customers',
    )
    if (Number(existing[0].count) > 0 && !wipe) {
      console.log(
        `  The database already holds ${existing[0].count} customers.\n` +
          '  Re-run with --wipe to replace them:  npm run db:seed -- --wipe\n',
      )
      return
    }

    if (wipe) {
      process.stdout.write('  Clearing existing data … ')
      // TRUNCATE ... CASCADE follows the FKs, so ordering does not matter.
      await client.query('truncate customers restart identity cascade')
      console.log('done')
    }

    // ---------------- build the population ----------------
    const plans: CustomerPlan[] = []

    // Claim the narrative names up front so the random population cannot take
    // one of them first.
    usedNames.add('Ayesha Siddiqui')
    usedNames.add('Imran Bhatti')

    for (let i = 0; i < REGULAR_CUSTOMERS; i++) {
      plans.push(makeCustomer({}))
    }

    // ---- Narrative 1: the thin-file hero ----
    // Excellent behaviour, long tenure, no bureau file whatsoever. This is the
    // applicant a traditional underwriter rejects for having no history.
    const hero = makeCustomer({
      persona: 'freelancer',
      tier: 'strong',
      city: CITIES.find((c) => c.name === 'Lahore'),
      walletAgeMonths: 44,
      narrative: 'thin_file_hero',
    })
    hero.row.full_name = 'Ayesha Siddiqui'
    hero.row.occupation = 'Freelance UI/UX designer'
    hero.row.has_bank_loan_history = false
    hero.row.bureau_score = null
    hero.billOnTimeRate = 1
    hero.billUnpaidRate = 0
    hero.incomeGapRate = 0.01
    hero.topupRegularity = 1
    hero.willDefault = false
    plans.push(hero)

    // ---- Narrative 2: the post-loan deterioration ----
    // Looked good at approval, then the income collapsed. Phase 6 has to raise
    // the alarm before the default rather than after it.
    const deteriorating = makeCustomer({
      persona: 'shopkeeper',
      tier: 'steady',
      city: CITIES.find((c) => c.name === 'Karachi'),
      walletAgeMonths: 30,
      narrative: 'deterioration',
    })
    deteriorating.row.full_name = 'Imran Bhatti'
    deteriorating.row.occupation = 'Mobile accessories retailer'
    // Income falls apart over the final three months of the window.
    deteriorating.collapseFromMonth = Math.max(1, MONTHS_OF_HISTORY - 3)
    deteriorating.willDefault = true
    plans.push(deteriorating)

    // ---- Narrative 3: the fraud ring ----
    // Applications that share a device, opened their wallets days apart, and
    // cycle the same money between each other to manufacture a history.
    const ringDevice = 'dev_ring_7fa31c'
    const ringCity = CITIES.find((c) => c.name === 'Faisalabad')!
    const ring: CustomerPlan[] = []
    for (let i = 0; i < FRAUD_RING_SIZE; i++) {
      const member = makeCustomer({
        persona: rng.pick(['online_seller', 'driver'] as PersonaId[]),
        tier: 'stretched',
        city: ringCity,
        // Shared device fingerprint — two of them also share it exactly, the
        // rest are near-identical, which is what a real ring looks like.
        device: i < 3 ? ringDevice : `${ringDevice}_${i}`,
        // Every wallet opened within weeks of the others.
        walletAgeMonths: rng.int(3, 5),
        narrative: 'fraud_ring',
      })
      member.row.address = `House ${rng.int(1, 40)}, Street 7, Ghulam Muhammadabad, Faisalabad`
      ring.push(member)
      plans.push(member)
    }

    console.log(`  Generated ${plans.length} customers`)
    console.log(
      `    ${plans.filter((p) => !p.narrative).length} population, ` +
        `1 thin-file hero, 1 deterioration case, ${FRAUD_RING_SIZE} fraud ring\n`,
    )

    // ---------------- insert customers ----------------
    const customerColumns = [
      'id', 'full_name', 'cnic', 'phone', 'email', 'date_of_birth', 'gender',
      'city', 'province', 'address', 'occupation', 'persona', 'employment_type',
      'declared_monthly_income', 'household_size', 'dependents', 'education_level',
      'primary_wallet', 'wallet_opened_at', 'device_fingerprint', 'sim_registered_at',
      'has_bank_loan_history', 'bureau_score',
    ]
    await bulkInsert(
      client,
      'customers',
      customerColumns,
      plans.map((p) => customerColumns.map((c) => (p.row as unknown as Record<string, unknown>)[c])),
    )
    console.log(`  ✓ customers            ${plans.length}`)

    // ---------------- generate and insert activity ----------------
    const allWallet: WalletRow[] = []
    const allTopups: TopupRow[] = []
    const allBills: BillRow[] = []

    plans.forEach((plan, i) => {
      const activity = generateActivity(plan)
      allWallet.push(...activity.wallet)
      allTopups.push(...activity.topups)
      allBills.push(...activity.bills)
      progress('generating activity', i + 1, plans.length)
    })

    // ---- the ring's circular transfers ----
    // Money that goes round the group and comes back is the signature Phase 5
    // looks for: it inflates everyone's apparent turnover without any of them
    // actually earning anything.
    // Amounts are a multiple of what the members supposedly earn rather than a
    // flat range: a ring cycling twenty times its own turnover is obvious to
    // the naked eye and would let Phase 5 "detect" it without doing any work.
    const ringIncome = ring.reduce((sum, m) => sum + m.baseMonthlyIncome, 0) / ring.length
    for (let cycle = 0; cycle < 18; cycle++) {
      const amount = rng.money(ringIncome * rng.float(0.12, 0.45), 500)
      const day = addDays(NOW, -rng.int(5, 95))
      for (let i = 0; i < ring.length; i++) {
        const from = ring[i]
        const to = ring[(i + 1) % ring.length]
        const at = atLocalTime(rng, day, 10, 23)
        const ref = `ring_${cycle}_${i}`
        allWallet.push([
          from.row.id, from.row.primary_wallet, 'out', 'p2p_out', amount, 0,
          ref, to.row.full_name, 'Transfer', at,
        ])
        allWallet.push([
          to.row.id, to.row.primary_wallet, 'in', 'p2p_in', amount, 0,
          ref, from.row.full_name, 'Transfer received', new Date(at.getTime() + rng.int(20, 400) * 1000),
        ])
      }
    }

    const walletColumns = [
      'customer_id', 'provider', 'direction', 'category', 'amount', 'balance_after',
      'counterparty_ref', 'counterparty_name', 'description', 'occurred_at',
    ]
    process.stdout.write(`  inserting ${allWallet.length.toLocaleString()} wallet transactions … `)
    await bulkInsert(client, 'wallet_transactions', walletColumns, allWallet)
    console.log('done')

    await bulkInsert(
      client,
      'topups',
      ['customer_id', 'network', 'amount', 'product_type', 'is_recurring', 'occurred_at'],
      allTopups,
    )
    console.log(`  ✓ topups               ${allTopups.length.toLocaleString()}`)

    await bulkInsert(
      client,
      'bill_payments',
      ['customer_id', 'biller_type', 'biller_name', 'billing_month', 'due_date',
       'amount_due', 'paid_at', 'amount_paid', 'status'],
      allBills,
      { onConflict: 'on conflict do nothing' },
    )
    console.log(`  ✓ bill payments        ${allBills.length.toLocaleString()}`)

    // ---------------- applications ----------------
    const applications: unknown[][] = []
    const loans: unknown[][] = []
    const repayments: unknown[][] = []

    for (const plan of plans) {
      // A past, decided application plus a loan gives the portfolio some
      // repayment history to monitor in Phase 6.
      const hasHistory =
        plan.narrative === 'deterioration' || (plan.narrative !== 'fraud_ring' && rng.chance(0.38))

      if (hasHistory) {
        const disbursedAt = addDays(NOW, -rng.int(90, 330))
        const principal = rng.money(plan.baseMonthlyIncome * rng.float(0.6, 2.4), 1000)
        const tenor = rng.pick([6, 9, 12, 12, 18])
        const appId = randomUUID()

        applications.push([
          appId, plan.row.id, applicationReference(), principal, tenor,
          rng.pick(LOAN_PURPOSES), 'approved', 'mobile_app',
          addDays(disbursedAt, -rng.int(1, 6)), disbursedAt, null,
          'Approved on behavioural signals.', plan.row.device_fingerprint,
          `103.${rng.int(1, 250)}.${rng.int(1, 250)}.${rng.int(1, 250)}`,
        ])

        const outcome =
          plan.narrative === 'deterioration'
            ? 'late'
            : plan.willDefault
              ? 'default'
              : plan.tier === 'strong' || plan.tier === 'steady'
                ? 'clean'
                : rng.chance(0.6)
                  ? 'clean'
                  : 'late'

        const bundle = buildLoan(plan, appId, { principal, tenor, disbursedAt, outcome })
        loans.push(bundle.loan)
        repayments.push(...bundle.repayments)
      }

      // Almost everyone has a live application, because a queue with three
      // items in it does not demonstrate a decision workflow.
      if (rng.chance(0.86)) {
        const submittedAt = addDays(NOW, -rng.int(0, 21))
        const status = rng.weighted([
          ['pending', 62],
          ['in_review', 14],
          ['approved', 12],
          ['rejected', 12],
        ]) as string
        const decided = status === 'approved' || status === 'rejected'

        applications.push([
          randomUUID(),
          plan.row.id,
          applicationReference(),
          rng.money(plan.baseMonthlyIncome * rng.float(0.8, 3.0), 1000),
          rng.pick([6, 9, 12, 12, 18, 24]),
          rng.pick(LOAN_PURPOSES),
          status,
          rng.weighted([['mobile_app', 70], ['agent', 18], ['ussd', 7], ['web', 5]]),
          submittedAt,
          decided ? addDays(submittedAt, rng.int(1, 4)) : null,
          null,
          decided ? (status === 'approved' ? 'Approved.' : 'Insufficient repayment capacity.') : null,
          plan.row.device_fingerprint,
          `103.${rng.int(1, 250)}.${rng.int(1, 250)}.${rng.int(1, 250)}`,
        ])
      }
    }

    await bulkInsert(
      client,
      'applications',
      ['id', 'customer_id', 'reference', 'requested_amount', 'requested_tenor_months',
       'purpose', 'status', 'channel', 'submitted_at', 'decided_at', 'decided_by',
       'decision_notes', 'device_fingerprint', 'ip_address'],
      applications,
    )
    console.log(`  ✓ applications         ${applications.length}`)

    await bulkInsert(
      client,
      'loans',
      ['id', 'customer_id', 'application_id', 'reference', 'principal', 'tenor_months',
       'annual_rate', 'instalment_amount', 'disbursed_at', 'first_due_date',
       'maturity_date', 'status', 'outstanding_balance'],
      loans,
    )
    console.log(`  ✓ loans                ${loans.length}`)

    await bulkInsert(
      client,
      'repayments',
      ['loan_id', 'customer_id', 'instalment_no', 'due_date', 'amount_due',
       'paid_at', 'amount_paid', 'days_late', 'status'],
      repayments,
    )
    console.log(`  ✓ repayments           ${repayments.length}`)

    // ---------------- ground-truth labels for Phase 3 ----------------
    // Stored on the features row rather than on customers, because it is a
    // modelling artefact of the synthetic data — not something a real lender
    // would ever have sitting on the customer record.
    await client.query(`
      create table if not exists seed_labels (
        customer_id  uuid primary key references customers (id) on delete cascade,
        tier         text not null,
        persona      text not null,
        narrative    text,
        will_default boolean not null
      )
    `)
    await client.query('truncate seed_labels')
    await bulkInsert(
      client,
      'seed_labels',
      ['customer_id', 'tier', 'persona', 'narrative', 'will_default'],
      plans.map((p) => [p.row.id, p.tier, p.persona, p.narrative ?? null, p.willDefault]),
    )
    console.log(`  ✓ ground-truth labels  ${plans.length}`)

    // ---------------- summary ----------------
    const { rows: summary } = await client.query<{ label: string; value: string }>(`
      select 'customers' as label, count(*)::text as value from customers
      union all select 'wallet transactions', count(*)::text from wallet_transactions
      union all select 'top-ups', count(*)::text from topups
      union all select 'bill payments', count(*)::text from bill_payments
      union all select 'applications', count(*)::text from applications
      union all select 'pending applications', count(*)::text from applications where status = 'pending'
      union all select 'loans', count(*)::text from loans
      union all select 'repayments', count(*)::text from repayments
    `)

    console.log('\n  Database contents')
    console.log('  ' + '─'.repeat(46))
    for (const row of summary) {
      console.log(`  ${row.label.padEnd(24)} ${Number(row.value).toLocaleString().padStart(10)}`)
    }
    console.log(`\n  Next:  npm run db:features\n`)
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error('\n✖ Seed failed:', err)
  process.exit(1)
})
