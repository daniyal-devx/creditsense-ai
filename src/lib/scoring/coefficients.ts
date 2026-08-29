/**
 * GENERATED FILE — DO NOT EDIT BY HAND.
 *
 * Written by `npm run model:train`. Committed on purpose: scoring has to be
 * reproducible, so an application scored today and audited next year yields
 * the same number. Refitting on every deploy would make that impossible.
 *
 * Fitted:     2026-08-29T07:50:39.446Z
 * Dataset:    328 customers, 62 defaults
 * AUC:        0.793 train / 0.687 held out
 * KS:         0.386 held out
 *
 * Weights are in log-odds of DEFAULT, one per encoded bin, in the column order
 * produced by `encodeFeatures()`. A positive weight raises the probability of
 * default; a negative weight lowers it.
 */

export const MODEL_VERSION = '1.0.0'
export const MODEL_TRAINED_AT = '2026-08-29T07:50:39.446Z'

export const MODEL_METRICS = {
  datasetSize: 328,
  defaults: 62,
  aucTrain: 0.7929,
  aucTest: 0.6866,
  ksTest: 0.3862,
} as const

export const BIAS = -1.162356

export const WEIGHTS: readonly number[] = [
  0.663052, // bill_punctuality:under 50%
  0.248655, // bill_punctuality:50–70%
  0.039401, // bill_punctuality:70–85%
  -0.464431, // bill_punctuality:85–95%
  -0.464431, // bill_punctuality:95% or better
  0.005562, // income_regularity:under half the months
  0.005562, // income_regularity:50–75% of months
  0.005562, // income_regularity:75–92% of months
  0.005562, // income_regularity:almost every month
  -0.579015, // income_volatility:very steady
  -0.086186, // income_volatility:steady
  -0.086186, // income_volatility:variable
  0.773634, // income_volatility:highly variable
  0.189039, // savings_rate:spends more than they earn
  0.189039, // savings_rate:almost nothing left
  0.189039, // savings_rate:a small margin
  -0.180659, // savings_rate:a comfortable margin
  -0.364210, // savings_rate:a large margin
  0.136199, // income_trend_90d:fallen sharply
  0.136199, // income_trend_90d:softened
  -0.125075, // income_trend_90d:holding steady
  -0.125075, // income_trend_90d:growing
  -0.322905, // current_missed_streak:none
  0.115051, // current_missed_streak:one month
  0.115051, // current_missed_streak:two to three months
  0.115051, // current_missed_streak:four months or more
  0.149785, // wallet_tenure_months:under 6 months
  0.149785, // wallet_tenure_months:6–12 months
  0.014949, // wallet_tenure_months:1–2 years
  -0.292272, // wallet_tenure_months:over 2 years
  0.081802, // activity_density:rarely used
  0.081802, // activity_density:used occasionally
  0.081802, // activity_density:used regularly
  -0.223159, // activity_density:used most days
  0.184490, // distinct_income_sources:one or none
  0.184490, // distinct_income_sources:two or three
  -0.173366, // distinct_income_sources:four to seven
  -0.173366, // distinct_income_sources:eight or more
  0.005562, // days_since_last_transaction:active this week
  0.005562, // days_since_last_transaction:active this month
  0.005562, // days_since_last_transaction:quiet for over a month
  0.005562, // days_since_last_transaction:dormant
  -0.175475, // cash_out_ratio:mostly digital
  0.098861, // cash_out_ratio:a mix
  0.098861, // cash_out_ratio:mostly cash
  0.159929, // avg_monthly_inflow:under Rs 25,000
  0.159929, // avg_monthly_inflow:Rs 25,000–50,000
  -0.148805, // avg_monthly_inflow:Rs 50,000–100,000
  -0.148805, // avg_monthly_inflow:over Rs 100,000
]
