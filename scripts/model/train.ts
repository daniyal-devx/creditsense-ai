/**
 * Fit the CreditSense scorecard.
 *
 *   npm run model:train
 *
 * Trains a regularised logistic regression over the binned features against
 * the labelled synthetic population, evaluates it on a held-out split, and
 * writes the coefficients to src/lib/scoring/coefficients.ts.
 *
 * Why this and not scikit-learn: the whole product deploys as one serverless
 * bundle on Vercel. A Python service would mean a second deploy target, a
 * network hop inside every scoring call, and a version-skew risk between the
 * features the trainer saw and the features the app computes. Logistic
 * regression is ~80 lines of gradient descent, and the resulting model is a
 * table of numbers that any risk officer can read.
 *
 * The generated file is committed. Scoring must be reproducible: an
 * application scored today and audited next year has to yield the same
 * number, which it cannot if the model is refitted on every deploy.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Client } from 'pg'
import { computeFeatures } from '../../src/lib/features/compute'
import type { SignalBundle } from '../../src/lib/features/types'
import {
  FEATURE_SPECS,
  TOTAL_ENCODED_COLUMNS,
  encodeFeatures,
  encodedColumnNames,
} from '../../src/lib/scoring/model'
import { loadEnv, migrationConnectionString } from '../db/env'

// ---------------------------------------------------------------------------
// Hyperparameters
// ---------------------------------------------------------------------------

const LEARNING_RATE = 0.12
const EPOCHS = 8000
/**
 * L2 penalty. Kept light because the monotonicity projection below now does
 * most of the regularising — it collapses exactly the degrees of freedom a
 * finite sample would otherwise overfit. Raising this shrinks every weight
 * toward zero and flattens the score distribution.
 */
const L2_LAMBDA = 0.006
const TRAIN_SPLIT = 0.75
/** Fixed so a re-run produces the same split and the same model. */
const SPLIT_SEED = 20260829

interface TrainingRow {
  customerId: string
  name: string
  encoded: number[]
  label: number
  tier: string
}

// ---------------------------------------------------------------------------
// Maths
// ---------------------------------------------------------------------------

function sigmoid(z: number): number {
  // Clamped to avoid Infinity in exp() for extreme scores, which would make
  // the gradient NaN and silently destroy the fit.
  if (z >= 0) {
    const e = Math.exp(-Math.min(z, 40))
    return 1 / (1 + e)
  }
  const e = Math.exp(Math.max(z, -40))
  return e / (1 + e)
}

function predict(weights: number[], bias: number, x: number[]): number {
  let z = bias
  for (let i = 0; i < x.length; i++) z += weights[i] * x[i]
  return sigmoid(z)
}

/**
 * Isotonic regression by pool-adjacent-violators.
 *
 * Returns the closest sequence to `values` (in least squares) that is
 * monotonically non-decreasing, or non-increasing when `increasing` is false.
 */
function isotonic(values: number[], increasing: boolean): number[] {
  const v = increasing ? [...values] : values.map((x) => -x)

  // Each block holds a running mean and the count it was pooled from.
  const means: number[] = []
  const counts: number[] = []

  for (const value of v) {
    means.push(value)
    counts.push(1)
    // Merge backwards while the previous block violates the ordering.
    while (means.length > 1 && means[means.length - 2] > means[means.length - 1]) {
      const meanB = means.pop()!
      const countB = counts.pop()!
      const meanA = means.pop()!
      const countA = counts.pop()!
      const merged = (meanA * countA + meanB * countB) / (countA + countB)
      means.push(merged)
      counts.push(countA + countB)
    }
  }

  const out: number[] = []
  for (let i = 0; i < means.length; i++) {
    for (let j = 0; j < counts[i]; j++) out.push(means[i])
  }

  return increasing ? out : out.map((x) => -x)
}

/**
 * Force each feature's weights to move monotonically across its bins, in the
 * direction the feature is supposed to work.
 *
 * This is standard practice in credit scorecards, and it is not merely a
 * regulariser. A model fitted freely on a finite sample will happily conclude
 * that missing three bills is safer than missing one, because two borrowers in
 * the training set happened to fall that way. That is indefensible to an
 * applicant and to a regulator no matter what the sample says — and it is
 * almost certainly noise rather than a discovery about credit risk.
 *
 * Constraining it also does the work L2 alone could not: it collapses the
 * degrees of freedom in exactly the places where a small sample overfits.
 */
function enforceMonotonicity(weights: number[]): number[] {
  const out = [...weights]
  let column = 0

  for (const spec of FEATURE_SPECS) {
    const width = spec.bins.length
    const slice = out.slice(column, column + width)

    // Weights are log-odds of DEFAULT. Bins run best-to-worst for a
    // `higherIsBetter` feature, so its weights must be non-increasing; for a
    // lower-is-better feature the bins run good-to-bad, so non-decreasing.
    const projected = isotonic(slice, !spec.higherIsBetter)

    for (let i = 0; i < width; i++) out[column + i] = projected[i]
    column += width
  }

  return out
}

/**
 * Batch gradient descent on the log-loss, projected onto the monotonic cone.
 *
 * `posWeight` counters class imbalance: defaults are the minority class, and
 * without re-weighting the model gets a good log-loss by predicting "will not
 * default" for everyone — which is a useless credit model that would approve
 * every application.
 */
function train(rows: TrainingRow[], columns: number): { weights: number[]; bias: number; history: number[] } {
  const weights = new Array(columns).fill(0)
  let bias = 0

  const positives = rows.filter((r) => r.label === 1).length
  const negatives = rows.length - positives
  const posWeight = positives > 0 ? negatives / positives : 1

  const history: number[] = []

  for (let epoch = 0; epoch < EPOCHS; epoch++) {
    const gradW = new Array(columns).fill(0)
    let gradB = 0
    let loss = 0
    let weightSum = 0

    for (const row of rows) {
      const p = predict(weights, bias, row.encoded)
      const w = row.label === 1 ? posWeight : 1
      const error = (p - row.label) * w

      gradB += error
      for (let i = 0; i < columns; i++) {
        if (row.encoded[i] !== 0) gradW[i] += error * row.encoded[i]
      }

      const clamped = Math.min(Math.max(p, 1e-9), 1 - 1e-9)
      loss += -w * (row.label * Math.log(clamped) + (1 - row.label) * Math.log(1 - clamped))
      weightSum += w
    }

    const n = Math.max(1, weightSum)
    bias -= LEARNING_RATE * (gradB / n)
    for (let i = 0; i < columns; i++) {
      // The L2 term is applied to the weights but never to the bias — the
      // bias sets the base rate and should not be shrunk toward zero.
      weights[i] -= LEARNING_RATE * (gradW[i] / n + L2_LAMBDA * weights[i])
    }

    // Projected gradient descent: take the unconstrained step, then project
    // back onto the set of monotonic weight vectors. Doing it every epoch
    // rather than once at the end means the remaining epochs keep optimising
    // *within* the constraint instead of fighting it.
    const projected = enforceMonotonicity(weights)
    for (let i = 0; i < columns; i++) weights[i] = projected[i]

    if (epoch % 200 === 0 || epoch === EPOCHS - 1) history.push(loss / n)
  }

  /**
   * Prior correction.
   *
   * Training with `posWeight` re-weights the minority class so the model does
   * not simply predict "never defaults" for everyone. But it also means the
   * fit is against an effective base rate of 50% rather than the true ~19%, so
   * every predicted probability comes out inflated.
   *
   * With a weight w on the positive class the fitted odds are w times the true
   * odds, so subtracting ln(w) from the intercept recovers the real scale.
   * (This is the standard rare-events correction — King & Zeng 2001.)
   *
   * Without it the whole population is squeezed into the middle of the 0–1000
   * scale: an applicant who paid 24 of 24 bills on time scored 688 and was
   * called "Moderate Risk", which is exactly the misjudgement this product
   * exists to correct.
   */
  const correctedBias = bias - Math.log(posWeight)

  return { weights, bias: correctedBias, history }
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

/**
 * Area under the ROC curve, computed via the Mann–Whitney U identity: the
 * probability that a randomly chosen defaulter scores higher than a randomly
 * chosen non-defaulter. 0.5 is a coin flip.
 */
function auc(pairs: { p: number; label: number }[]): number {
  const positives = pairs.filter((x) => x.label === 1)
  const negatives = pairs.filter((x) => x.label === 0)
  if (positives.length === 0 || negatives.length === 0) return 0.5

  let concordant = 0
  for (const pos of positives) {
    for (const neg of negatives) {
      if (pos.p > neg.p) concordant += 1
      else if (pos.p === neg.p) concordant += 0.5
    }
  }
  return concordant / (positives.length * negatives.length)
}

/** Kolmogorov–Smirnov: the maximum separation between the two distributions. */
function ksStatistic(pairs: { p: number; label: number }[]): number {
  const sorted = [...pairs].sort((a, b) => b.p - a.p)
  const totalPos = sorted.filter((x) => x.label === 1).length
  const totalNeg = sorted.length - totalPos
  if (totalPos === 0 || totalNeg === 0) return 0

  let cumPos = 0
  let cumNeg = 0
  let ks = 0
  for (const row of sorted) {
    if (row.label === 1) cumPos++
    else cumNeg++
    ks = Math.max(ks, Math.abs(cumPos / totalPos - cumNeg / totalNeg))
  }
  return ks
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  loadEnv()

  const client = new Client({
    connectionString: migrationConnectionString(),
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 20_000,
  })
  await client.connect()

  console.log('\n  Training the CreditSense scorecard\n  ' + '─'.repeat(60))

  try {
    const labels = await client.query<{ customer_id: string; will_default: boolean; tier: string }>(
      'select customer_id, will_default, tier from seed_labels',
    )
    if (labels.rows.length === 0) {
      console.error(
        '\n  ✖ No labelled data. Run `npm run db:seed` first — the seed writes the\n' +
          '    ground-truth default labels the model trains against.\n',
      )
      process.exit(1)
    }

    const customers = await client.query<{ id: string; full_name: string; wallet_opened_at: Date }>(
      'select id, full_name, wallet_opened_at from customers',
    )
    const ids = customers.rows.map((c) => c.id)

    process.stdout.write('  Loading signals … ')

    const tx = await client.query(
      `select customer_id, direction, category, amount, balance_after, counterparty_ref, occurred_at
         from wallet_transactions where customer_id = any($1::uuid[]) and is_reversed = false`,
      [ids],
    )
    const bills = await client.query(
      `select customer_id, biller_type, biller_name, billing_month, due_date, amount_due, paid_at, status
         from bill_payments where customer_id = any($1::uuid[])`,
      [ids],
    )
    const topups = await client.query(
      `select customer_id, amount, is_recurring, occurred_at
         from topups where customer_id = any($1::uuid[])`,
      [ids],
    )
    const loans = await client.query(
      `select customer_id, status, outstanding_balance from loans where customer_id = any($1::uuid[])`,
      [ids],
    )
    const repayments = await client.query(
      `select customer_id, status, days_late from repayments where customer_id = any($1::uuid[])`,
      [ids],
    )

    console.log(`${tx.rows.length.toLocaleString()} transactions`)

    function groupBy<T extends { customer_id: string }, R>(rows: T[], map: (r: T) => R) {
      const out = new Map<string, R[]>()
      for (const row of rows) {
        const list = out.get(row.customer_id)
        if (list) list.push(map(row))
        else out.set(row.customer_id, [map(row)])
      }
      return out
    }

    const txBy = groupBy(tx.rows, (r) => ({
      direction: r.direction,
      category: r.category,
      amount: Number(r.amount),
      balanceAfter: r.balance_after === null ? null : Number(r.balance_after),
      counterpartyRef: r.counterparty_ref,
      occurredAt: r.occurred_at,
    }))
    const billsBy = groupBy(bills.rows, (r) => ({
      billerType: r.biller_type,
      billerName: r.biller_name,
      billingMonth: r.billing_month,
      dueDate: r.due_date,
      amountDue: Number(r.amount_due),
      paidAt: r.paid_at,
      status: r.status,
    }))
    const topupsBy = groupBy(topups.rows, (r) => ({
      amount: Number(r.amount),
      isRecurring: r.is_recurring,
      occurredAt: r.occurred_at,
    }))
    const loansBy = groupBy(loans.rows, (r) => ({
      status: r.status,
      outstandingBalance: Number(r.outstanding_balance),
    }))
    const repaymentsBy = groupBy(repayments.rows, (r) => ({
      status: r.status,
      daysLate: r.days_late,
    }))

    const labelBy = new Map(labels.rows.map((r) => [r.customer_id, r]))
    const asOf = new Date()

    const dataset: TrainingRow[] = []
    for (const customer of customers.rows) {
      const label = labelBy.get(customer.id)
      if (!label) continue

      const bundle: SignalBundle = {
        walletOpenedAt: customer.wallet_opened_at,
        transactions: txBy.get(customer.id) ?? [],
        bills: billsBy.get(customer.id) ?? [],
        topups: topupsBy.get(customer.id) ?? [],
        loans: loansBy.get(customer.id) ?? [],
        repayments: repaymentsBy.get(customer.id) ?? [],
      }

      dataset.push({
        customerId: customer.id,
        name: customer.full_name,
        encoded: encodeFeatures(computeFeatures(bundle, asOf)),
        label: label.will_default ? 1 : 0,
        tier: label.tier,
      })
    }

    const defaults = dataset.filter((r) => r.label === 1).length
    console.log(
      `  Dataset: ${dataset.length} customers, ${defaults} defaults ` +
        `(${((defaults / dataset.length) * 100).toFixed(1)}% base rate)`,
    )

    if (defaults < 5) {
      console.error(
        '\n  ✖ Too few defaults to fit anything meaningful. Re-seed with more data.\n',
      )
      process.exit(1)
    }

    // ---- deterministic stratified split ----
    // Stratified so the small default class is represented in both halves; a
    // random split can easily put every defaulter on one side.
    let seed = SPLIT_SEED
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed / 0x7fffffff
    }

    const shuffled = [...dataset].sort(() => rand() - 0.5)
    const positives = shuffled.filter((r) => r.label === 1)
    const negatives = shuffled.filter((r) => r.label === 0)
    const posCut = Math.floor(positives.length * TRAIN_SPLIT)
    const negCut = Math.floor(negatives.length * TRAIN_SPLIT)

    const trainSet = [...positives.slice(0, posCut), ...negatives.slice(0, negCut)]
    const testSet = [...positives.slice(posCut), ...negatives.slice(negCut)]

    console.log(`  Split:   ${trainSet.length} train / ${testSet.length} held out\n`)

    // ---- fit ----
    process.stdout.write('  Fitting … ')
    const { weights, bias, history } = train(trainSet, TOTAL_ENCODED_COLUMNS)
    console.log(`done (loss ${history[0].toFixed(4)} → ${history[history.length - 1].toFixed(4)})`)

    // ---- evaluate ----
    const evaluate = (rows: TrainingRow[]) =>
      rows.map((r) => ({ p: predict(weights, bias, r.encoded), label: r.label }))

    const trainPairs = evaluate(trainSet)
    const testPairs = evaluate(testSet)

    const trainAuc = auc(trainPairs)
    const testAuc = auc(testPairs)
    const testKs = ksStatistic(testPairs)

    console.log('\n  Performance')
    console.log('  ' + '─'.repeat(60))
    console.log(`  AUC (train)      ${trainAuc.toFixed(3)}`)
    console.log(`  AUC (held out)   ${testAuc.toFixed(3)}`)
    console.log(`  KS  (held out)   ${testKs.toFixed(3)}`)

    if (testAuc < 0.65) {
      console.log('\n  ⚠ Held-out AUC is weak. The features may not separate the classes.')
    } else if (trainAuc - testAuc > 0.2) {
      console.log('\n  ⚠ Large train/test gap — the model is overfitting. Raise L2_LAMBDA.')
    }

    // ---- sanity-check the signs ----
    // A feature we believe protects against default coming out with the wrong
    // sign means the data or the encoding is wrong, not that we have learned
    // something surprising about credit risk.
    console.log('\n  Feature directions')
    console.log('  ' + '─'.repeat(60))

    let column = 0
    const warnings: string[] = []
    for (const spec of FEATURE_SPECS) {
      const slice = weights.slice(column, column + spec.bins.length)
      column += spec.bins.length

      const spread = Math.max(...slice) - Math.min(...slice)

      // A feature the isotonic projection flattened to nothing carries no
      // signal — that is a weak feature, not a wrongly-signed one, and
      // reporting it as a direction error would be a false alarm.
      const FLAT_THRESHOLD = 0.02
      if (spread < FLAT_THRESHOLD) {
        console.log(
          `  · ${spec.label.padEnd(24)} spread ${spread.toFixed(3).padStart(6)}   no signal in this data`,
        )
        continue
      }

      // Weights are log-odds of default, so a protective feature should have
      // weights that DECREASE as the (better) bin index rises.
      const trend = slice[slice.length - 1] - slice[0]
      const agrees = spec.higherIsBetter ? trend < 0 : trend > 0

      console.log(
        `  ${agrees ? '✓' : '⚠'} ${spec.label.padEnd(24)} spread ${spread.toFixed(3).padStart(6)}` +
          `  ${agrees ? '' : ' UNEXPECTED DIRECTION'}`,
      )
      if (!agrees && spread > 0.15) {
        warnings.push(spec.label)
      }
    }

    if (warnings.length > 0) {
      console.log(
        `\n  ⚠ ${warnings.length} feature(s) point the wrong way with meaningful weight:\n` +
          `    ${warnings.join(', ')}\n` +
          '    Check the seed data before trusting this model.',
      )
    }

    // ---- write the coefficients ----
    const generated = renderCoefficientsFile({
      weights,
      bias,
      trainAuc,
      testAuc,
      testKs,
      datasetSize: dataset.length,
      defaults,
      trainedAt: new Date(),
    })

    const outPath = join(process.cwd(), 'src', 'lib', 'scoring', 'coefficients.ts')
    writeFileSync(outPath, generated, 'utf8')
    console.log(`\n  ✓ Wrote src/lib/scoring/coefficients.ts`)
    console.log('\n  Next:  npm run db:score\n')
  } finally {
    await client.end()
  }
}

function renderCoefficientsFile(model: {
  weights: number[]
  bias: number
  trainAuc: number
  testAuc: number
  testKs: number
  datasetSize: number
  defaults: number
  trainedAt: Date
}): string {
  const names = encodedColumnNames()
  const weightLines = model.weights
    .map((w, i) => `  ${w.toFixed(6)}, // ${names[i]}`)
    .join('\n')

  return `/**
 * GENERATED FILE — DO NOT EDIT BY HAND.
 *
 * Written by \`npm run model:train\`. Committed on purpose: scoring has to be
 * reproducible, so an application scored today and audited next year yields
 * the same number. Refitting on every deploy would make that impossible.
 *
 * Fitted:     ${model.trainedAt.toISOString()}
 * Dataset:    ${model.datasetSize} customers, ${model.defaults} defaults
 * AUC:        ${model.trainAuc.toFixed(3)} train / ${model.testAuc.toFixed(3)} held out
 * KS:         ${model.testKs.toFixed(3)} held out
 *
 * Weights are in log-odds of DEFAULT, one per encoded bin, in the column order
 * produced by \`encodeFeatures()\`. A positive weight raises the probability of
 * default; a negative weight lowers it.
 */

export const MODEL_VERSION = '1.0.0'
export const MODEL_TRAINED_AT = '${model.trainedAt.toISOString()}'

export const MODEL_METRICS = {
  datasetSize: ${model.datasetSize},
  defaults: ${model.defaults},
  aucTrain: ${model.trainAuc.toFixed(4)},
  aucTest: ${model.testAuc.toFixed(4)},
  ksTest: ${model.testKs.toFixed(4)},
} as const

export const BIAS = ${model.bias.toFixed(6)}

export const WEIGHTS: readonly number[] = [
${weightLines}
]
`
}

main().catch((err) => {
  console.error('\n✖ Training failed:', err)
  process.exit(1)
})
