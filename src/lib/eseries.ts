export const SERIES = ['E6', 'E12', 'E24', 'E48', 'E96', 'E192'] as const
export type Series = (typeof SERIES)[number]

const E24 = [1.0, 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 2.0, 2.2, 2.4, 2.7, 3.0, 3.3, 3.6, 3.9, 4.3, 4.7, 5.1, 5.6, 6.2, 6.8, 7.5, 8.2, 9.1]
const cache = new Map<Series, number[]>()

/** Significand values of one decade, [1, 10). E6/E12 are subsets of E24; E48/E96/E192 follow round(10^(i/n)). */
export function mantissas(s: Series): number[] {
  const hit = cache.get(s)
  if (hit) return hit
  let out: number[]
  if (s === 'E6') out = E24.filter((_, i) => i % 4 === 0)
  else if (s === 'E12') out = E24.filter((_, i) => i % 2 === 0)
  else if (s === 'E24') out = E24
  else {
    const n = s === 'E48' ? 48 : s === 'E96' ? 96 : 192
    out = Array.from({ length: n }, (_, i) => Math.round(10 ** (i / n) * 100 + 1e-9) / 100)
  }
  cache.set(s, out)
  return out
}

const clean = (x: number) => Number(x.toPrecision(6))

/** Closest standard value to v (by ratio), any magnitude. */
export function nearest(v: number, s: Series): number {
  if (!(v > 0) || !Number.isFinite(v)) return v
  const d = Math.floor(Math.log10(v))
  let best = 0
  let bestErr = Infinity
  for (let e = d - 1; e <= d + 1; e++) {
    for (const m of [...mantissas(s), 10]) {
      const c = m * 10 ** e
      const err = Math.abs(Math.log(c / v))
      if (err < bestErr) {
        bestErr = err
        best = c
      }
    }
  }
  return clean(best)
}

/** All standard values in [lo, hi]. */
export function valuesBetween(lo: number, hi: number, s: Series): number[] {
  const out: number[] = []
  for (let e = Math.floor(Math.log10(lo)) - 1; e <= Math.ceil(Math.log10(hi)); e++) {
    for (const m of mantissas(s)) {
      const c = clean(m * 10 ** e)
      if (c >= lo * 0.999999 && c <= hi * 1.000001) out.push(c)
    }
  }
  return out
}

/** Smallest standard value that is >= v. */
export function ceilTo(v: number, s: Series): number {
  const d = Math.floor(Math.log10(v))
  let best = Infinity
  for (let e = d; e <= d + 1; e++) {
    for (const m of mantissas(s)) {
      const c = clean(m * 10 ** e)
      if (c >= v * 0.999999 && c < best) best = c
    }
  }
  return best
}

/** Largest standard value that is <= v. */
export function floorTo(v: number, s: Series): number {
  const d = Math.floor(Math.log10(v))
  let best = 0
  for (let e = d - 1; e <= d; e++) {
    for (const m of mantissas(s)) {
      const c = clean(m * 10 ** e)
      if (c <= v * 1.000001 && c > best) best = c
    }
  }
  return best
}

/**
 * Two standard values a, b with b / a as close to `ratio` as possible, a within a
 * decade centred on `base`. Ties go to the value of a nearest the base.
 */
export function bestPair(ratio: number, s: Series, base: number): { a: number; b: number; err: number } {
  let best = { a: nearest(base, s), b: nearest(base * ratio, s), err: Infinity }
  let bestDist = Infinity
  for (const a of valuesBetween(base / Math.sqrt(10), base * Math.sqrt(10), s)) {
    const b = nearest(a * ratio, s)
    const err = b / a / ratio - 1
    const dist = Math.abs(Math.log(a / base))
    if (Math.abs(err) < Math.abs(best.err) - 1e-12 || (Math.abs(Math.abs(err) - Math.abs(best.err)) <= 1e-12 && dist < bestDist)) {
      best = { a, b, err }
      bestDist = dist
    }
  }
  return best
}
