/**
 * A seeded, deterministic random number generator.
 *
 * Every demo needs to tell the same story twice. If the seed data shifted on
 * each run, a score quoted in a demo script would stop matching the screen,
 * and a bug in the feature engine would be impossible to reproduce. So all
 * randomness here flows through one explicitly seeded generator.
 *
 * mulberry32: small, fast, and good enough statistically for synthetic
 * financial behaviour. Not for anything cryptographic.
 */
export class Rng {
  private state: number

  constructor(seed: number | string) {
    this.state = typeof seed === 'string' ? Rng.hashString(seed) : seed >>> 0
  }

  private static hashString(s: string): number {
    let h = 2166136261 >>> 0
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i)
      h = Math.imul(h, 16777619) >>> 0
    }
    return h >>> 0
  }

  /** Uniform in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0
    let t = this.state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  /** Uniform float in [min, max). */
  float(min: number, max: number): number {
    return min + this.next() * (max - min)
  }

  /** Uniform integer in [min, max], inclusive. */
  int(min: number, max: number): number {
    return Math.floor(this.float(min, max + 1))
  }

  /** True with probability `p`. */
  chance(p: number): boolean {
    return this.next() < p
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('pick() called with an empty array')
    return items[this.int(0, items.length - 1)]
  }

  /** Pick with relative weights. */
  weighted<T>(entries: readonly (readonly [T, number])[]): T {
    const total = entries.reduce((sum, [, w]) => sum + w, 0)
    let roll = this.next() * total
    for (const [value, weight] of entries) {
      roll -= weight
      if (roll <= 0) return value
    }
    return entries[entries.length - 1][0]
  }

  /** Fisher–Yates, returning a new array. */
  shuffle<T>(items: readonly T[]): T[] {
    const out = [...items]
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(0, i)
      ;[out[i], out[j]] = [out[j], out[i]]
    }
    return out
  }

  /** `count` distinct items. */
  sample<T>(items: readonly T[], count: number): T[] {
    return this.shuffle(items).slice(0, Math.min(count, items.length))
  }

  /**
   * Normal deviate via Box–Muller.
   *
   * Real transaction amounts cluster around a typical value with occasional
   * outliers, which a uniform distribution does not reproduce at all.
   */
  normal(mean: number, stdDev: number): number {
    const u1 = Math.max(this.next(), Number.EPSILON)
    const u2 = this.next()
    return mean + stdDev * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
  }

  /** Normal, clamped to a floor and ceiling. Used for money, which cannot be negative. */
  clampedNormal(mean: number, stdDev: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, this.normal(mean, stdDev)))
  }

  /**
   * Log-normal — the right shape for incomes and transaction sizes, where the
   * spread grows with the typical value and the tail runs long to the right.
   */
  logNormal(median: number, sigma: number): number {
    return median * Math.exp(this.normal(0, sigma))
  }

  /** Round money to whole rupees — nobody transfers 4.37 PKR. */
  money(value: number, roundTo = 1): number {
    return Math.max(roundTo, Math.round(value / roundTo) * roundTo)
  }
}

// ---------------------------------------------------------------------------
// Date helpers. Everything is built around Asia/Karachi, which is UTC+5 with
// no daylight saving — so a fixed offset is correct here, not an approximation.
// ---------------------------------------------------------------------------

export const PK_OFFSET_MS = 5 * 60 * 60 * 1000

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000)
}

export function addMonths(date: Date, months: number): Date {
  const d = new Date(date)
  const targetMonth = d.getUTCMonth() + months
  d.setUTCMonth(targetMonth)
  return d
}

export function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
}

export function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}

/** `YYYY-MM-DD` in Pakistan local time. */
export function toDateString(date: Date): string {
  return new Date(date.getTime() + PK_OFFSET_MS).toISOString().slice(0, 10)
}

/** A timestamp on `day` at a plausible hour of local activity. */
export function atLocalTime(rng: Rng, day: Date, minHour = 7, maxHour = 22): Date {
  const hour = rng.int(minHour, maxHour)
  const minute = rng.int(0, 59)
  const second = rng.int(0, 59)
  const local = new Date(
    Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour, minute, second),
  )
  // Interpret those wall-clock numbers as Karachi time.
  return new Date(local.getTime() - PK_OFFSET_MS)
}
