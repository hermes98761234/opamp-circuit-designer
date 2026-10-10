/** Small-signal AC analysis by modified nodal analysis with a single-pole op-amp model. */
export type Elem =
  | { t: 'R' | 'C'; a: string; b: string; v: number }
  | { t: 'OA'; p: string; n: string; o: string }

export type Circuit = {
  elems: Elem[]
  /** Nodes driven by an ideal AC voltage source (volts, relative to node '0' = ground). */
  drive: Record<string, number>
  out: string
}

export type OpAmp = {
  /** Gain-bandwidth product, Hz. */
  gbw: number
  /** DC open-loop gain, V/V. */
  a0: number
}

/** A practically ideal op-amp: huge gain and bandwidth. */
export const IDEAL: OpAmp = { gbw: 1e18, a0: 1e12 }

export type Cx = [number, number]

/** Complex output voltage of the circuit at frequency f (Hz). */
export function transfer(c: Circuit, op: OpAmp, f: number): Cx {
  const idx = new Map<string, number>()
  const node = (name: string) => {
    if (name === '0') return -1
    let i = idx.get(name)
    if (i === undefined) {
      i = idx.size
      idx.set(name, i)
    }
    return i
  }
  for (const e of c.elems) {
    if (e.t === 'OA') [e.p, e.n, e.o].forEach(node)
    else [e.a, e.b].forEach(node)
  }
  const sources = Object.keys(c.drive)
  sources.forEach(node)
  const amps = c.elems.filter((e) => e.t === 'OA')
  node(c.out)
  const nn = idx.size
  const size = nn + sources.length + amps.length
  const re = Array.from({ length: size }, () => new Array<number>(size + 1).fill(0))
  const im = Array.from({ length: size }, () => new Array<number>(size + 1).fill(0))
  const w = 2 * Math.PI * f
  const add = (r: number, k: number, x: number, y: number) => {
    if (r < 0 || k < 0) return
    re[r][k] += x
    im[r][k] += y
  }
  const stamp = (a: number, b: number, x: number, y: number) => {
    add(a, a, x, y)
    add(b, b, x, y)
    add(a, b, -x, -y)
    add(b, a, -x, -y)
  }
  for (const e of c.elems) {
    if (e.t === 'R') stamp(node(e.a), node(e.b), 1 / e.v, 0)
    else if (e.t === 'C') stamp(node(e.a), node(e.b), 0, w * e.v)
  }
  sources.forEach((s, i) => {
    const row = nn + i
    const k = node(s)
    add(k, row, 1, 0)
    add(row, k, 1, 0)
    re[row][size] = c.drive[s]
  })
  // A(jf) = a0 / (1 + j f / fp), fp = gbw / a0
  const fp = op.gbw / op.a0
  const den = 1 + (f / fp) ** 2
  const ar = op.a0 / den
  const ai = (-op.a0 * (f / fp)) / den
  amps.forEach((e, i) => {
    if (e.t !== 'OA') return
    const row = nn + sources.length + i
    const o = node(e.o)
    add(o, row, 1, 0)
    add(row, o, 1, 0)
    add(row, node(e.p), -ar, -ai)
    add(row, node(e.n), ar, ai)
  })
  // Gaussian elimination with partial pivoting on a complex matrix.
  for (let col = 0; col < size; col++) {
    let piv = col
    let big = -1
    for (let r = col; r < size; r++) {
      const m = re[r][col] ** 2 + im[r][col] ** 2
      if (m > big) {
        big = m
        piv = r
      }
    }
    if (big < 1e-300) return [NaN, NaN]
    ;[re[col], re[piv]] = [re[piv], re[col]]
    ;[im[col], im[piv]] = [im[piv], im[col]]
    const pr = re[col][col]
    const pi = im[col][col]
    const pm = pr * pr + pi * pi
    for (let r = col + 1; r < size; r++) {
      const xr = re[r][col]
      const xi = im[r][col]
      if (xr === 0 && xi === 0) continue
      // factor = x / p
      const fr = (xr * pr + xi * pi) / pm
      const fi = (xi * pr - xr * pi) / pm
      for (let k = col; k <= size; k++) {
        const ur = re[col][k]
        const ui = im[col][k]
        re[r][k] -= fr * ur - fi * ui
        im[r][k] -= fr * ui + fi * ur
      }
    }
  }
  const xr = new Array<number>(size).fill(0)
  const xi = new Array<number>(size).fill(0)
  for (let r = size - 1; r >= 0; r--) {
    let sr = re[r][size]
    let si = im[r][size]
    for (let k = r + 1; k < size; k++) {
      sr -= re[r][k] * xr[k] - im[r][k] * xi[k]
      si -= re[r][k] * xi[k] + im[r][k] * xr[k]
    }
    const pr = re[r][r]
    const pi = im[r][r]
    const pm = pr * pr + pi * pi
    xr[r] = (sr * pr + si * pi) / pm
    xi[r] = (si * pr - sr * pi) / pm
  }
  const o = node(c.out)
  return o < 0 ? [0, 0] : [xr[o], xi[o]]
}

export type Response = { f: number[]; mag: number[]; phase: number[] }

export const logspace = (f1: number, f2: number, perDecade = 24): number[] => {
  const n = Math.max(2, Math.ceil(Math.log10(f2 / f1) * perDecade) + 1)
  return Array.from({ length: n }, (_, i) => f1 * (f2 / f1) ** (i / (n - 1)))
}

/** Magnitude (dB) and unwrapped phase (degrees) over the given frequencies. */
export function sweep(c: Circuit, op: OpAmp, freqs: number[]): Response {
  const mag: number[] = []
  const phase: number[] = []
  let prev = 0
  freqs.forEach((f, i) => {
    const [x, y] = transfer(c, op, f)
    mag.push(20 * Math.log10(Math.max(Math.hypot(x, y), 1e-15)))
    let p = (Math.atan2(y, x) * 180) / Math.PI
    if (i > 0) p += 360 * Math.round((prev - p) / 360)
    prev = p
    phase.push(p)
  })
  return { f: freqs, mag, phase }
}

/** First frequency where the curve falls through `level` (dB), interpolated in log f; undefined if it never does. */
export function crossDown(f: number[], db: number[], level: number): number | undefined {
  for (let i = 0; i < f.length - 1; i++) {
    if (db[i] >= level && db[i + 1] < level) return interp(f, db, i, level)
  }
  return undefined
}

/** First frequency where the curve rises through `level` (dB). */
export function crossUp(f: number[], db: number[], level: number): number | undefined {
  for (let i = 0; i < f.length - 1; i++) {
    if (db[i] < level && db[i + 1] >= level) return interp(f, db, i, level)
  }
  return undefined
}

function interp(f: number[], db: number[], i: number, level: number): number {
  const t = (level - db[i]) / (db[i + 1] - db[i])
  return Math.exp(Math.log(f[i]) + t * (Math.log(f[i + 1]) - Math.log(f[i])))
}
