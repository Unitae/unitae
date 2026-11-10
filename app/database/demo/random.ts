/**
 * A seeded random source (mulberry32), so a rerun of the demo seed with the same seed and the same day writes the
 * same congregation. Only the seed scripts use it: nothing in the app needs reproducible randomness.
 */
export class Random {
  private state: number

  constructor(seed: number) {
    this.state = seed >>> 0
  }

  /** A float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0
    let t = this.state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  /** An integer in [min, max], both included. */
  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min
  }

  chance(probability: number): boolean {
    return this.next() < probability
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Random.pick on an empty list')
    return items[Math.floor(this.next() * items.length)] as T
  }

  /** A copy in random order. */
  shuffle<T>(items: readonly T[]): T[] {
    const copy = [...items]
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1))
      ;[copy[i], copy[j]] = [copy[j] as T, copy[i] as T]
    }
    return copy
  }

  /** One of the keys, in proportion to its weight. */
  weighted<K extends string | number>(weights: Readonly<Record<K, number>>): K {
    const entries = Object.entries(weights) as [string, number][]
    const total = entries.reduce((sum, [, weight]) => sum + weight, 0)
    let roll = this.next() * total
    for (const [key, weight] of entries) {
      roll -= weight
      if (roll < 0) return (Number.isNaN(Number(key)) ? key : Number(key)) as K
    }
    const last = entries.at(-1)?.[0] as string
    return (Number.isNaN(Number(last)) ? last : Number(last)) as K
  }

  /**
   * A value drawn from a distribution known by its 10th, 25th, 50th, 75th and 90th percentiles, interpolating
   * linearly between them (and a little beyond the ends). Rounded to an integer.
   */
  fromPercentiles(p: Percentiles): number {
    const points: [number, number][] = [
      [0, Math.max(0, p[10] - (p[25] - p[10]))],
      [0.1, p[10]],
      [0.25, p[25]],
      [0.5, p[50]],
      [0.75, p[75]],
      [0.9, p[90]],
      [1, p[90] + (p[90] - p[75])],
    ]
    const u = this.next()
    for (let i = 1; i < points.length; i++) {
      const [u1, v1] = points[i] as [number, number]
      const [u0, v0] = points[i - 1] as [number, number]
      if (u <= u1) return Math.round(v0 + ((u - u0) / (u1 - u0)) * (v1 - v0))
    }
    return Math.round(p[90])
  }
}

export interface Percentiles {
  10: number
  25: number
  50: number
  75: number
  90: number
}
