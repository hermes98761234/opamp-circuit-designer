import { N } from '../i18n'
import { bestPair, ceilTo, nearest, type Series } from './eseries'
import { fmtDb, fmtHz, fmtNum, fmtPct, fmtU } from './format'
import { crossDown, crossUp, IDEAL, logspace, sweep, transfer, type Circuit, type Elem, type OpAmp, type Response } from './mna'

export const KINDS = [
  'inverting',
  'noninverting',
  'differential',
  'instrumentation',
  'summing',
  'integrator',
  'skLp',
  'skHp',
  'mfbLp',
  'mfbBp',
  'schmitt',
] as const
export type Kind = (typeof KINDS)[number]

export type Params = Record<string, number>

export type ParamDef = {
  key: string
  label: string
  /** Unit suffix shown next to the field ('' = dimensionless). */
  unit: string
  def: number
  min: number
  max: number
  hint?: string
  options?: { v: number; label: string }[]
  presets?: { label: string; v: number }[]
}

export type Ctx = {
  /** Resistor series. */
  rs: Series
  /** Capacitor series. */
  cs: Series
  /** Resistor tolerance as a fraction (0.01 = 1 %). */
  tol: number
  op: OpAmp
}

export type Part = { ref: string; kind: 'R' | 'C'; ideal: number; value: number }
export type Spec = { label: string; value: string; tone?: 'ok' | 'warn' | 'err' }
export type Note = { text: string; args: (string | number)[]; tone: 'warn' | 'info' }
export type Chart =
  | { type: 'bode'; resp: Response; ideal: Response; marks: { f: number; label: string }[] }
  | { type: 'hyst'; vth: number; vtl: number; vhi: number; vlo: number }
export type Design = {
  parts: Part[]
  specs: Spec[]
  notes: Note[]
  chart: Chart
  /** Layout switches for the schematic. */
  flags: { equal?: boolean; rf?: boolean; vref?: string; inputs?: number }
}

export type CircuitDef = {
  kind: Kind
  title: string
  blurb: string
  params: ParamDef[]
  design: (p: Params, ctx: Ctx) => Design
}

const TAU = 2 * Math.PI
const db = (x: number) => 20 * Math.log10(Math.abs(x))

// ---------------------------------------------------------------- closed-form filter formulas

/** Sallen-Key low-pass: R1 from input, R2 to + input, C1 from the middle node to the output, C2 from + input to ground. */
export function skLpFormula(R1: number, R2: number, C1: number, C2: number, K: number) {
  const w0 = 1 / Math.sqrt(R1 * R2 * C1 * C2)
  const a1 = C2 * (R1 + R2) + R1 * C1 * (1 - K)
  return { f0: w0 / TAU, q: 1 / (w0 * a1), gain: K }
}

/** Sallen-Key high-pass: C1 from input, C2 to + input, R1 from the middle node to the output, R2 from + input to ground. */
export function skHpFormula(R1: number, R2: number, C1: number, C2: number, K: number) {
  const w0 = 1 / Math.sqrt(R1 * R2 * C1 * C2)
  const a1 = R2 * (C1 + C2) + R1 * C2 * (1 - K)
  return { f0: w0 / TAU, q: 1 / (w0 * a1), gain: K }
}

/** Multiple-feedback low-pass: R1 in, R2 to the inverting input, R3 to the output, C1 to ground, C2 across the amplifier. */
export function mfbLpFormula(R1: number, R2: number, R3: number, C1: number, C2: number) {
  const w0 = 1 / Math.sqrt(R2 * R3 * C1 * C2)
  const q = Math.sqrt(R2 * R3 * C1 * C2) / (R2 * R3 * C2 * (1 / R1 + 1 / R2 + 1 / R3))
  return { f0: w0 / TAU, q, gain: R3 / R1 }
}

/** Multiple-feedback band-pass: R1 in, C1 to the inverting input, C2 to the output, R2 to ground, R3 across the amplifier. */
export function mfbBpFormula(R1: number, R2: number, R3: number, C1: number, C2: number) {
  const w0 = Math.sqrt((1 / R1 + 1 / R2) / (C1 * C2 * R3))
  const bw = (C1 + C2) / (C1 * C2 * R3)
  return { f0: w0 / TAU, q: w0 / bw, gain: (C1 * R3) / (R1 * (C1 + C2)) }
}

/** Inverting Schmitt trigger (positive feedback R1 from output, R2 to Vref): thresholds for the output at each rail. */
export function schmittThresholds(R1: number, R2: number, vref: number, vhi: number, vlo: number) {
  const b = R2 / (R1 + R2)
  return { vth: vref + (vhi - vref) * b, vtl: vref + (vlo - vref) * b, beta: b }
}

// ---------------------------------------------------------------- helpers

const part = (ref: string, kind: 'R' | 'C', ideal: number, value: number): Part => ({ ref, kind, ideal, value })
const R = (ref: string, ideal: number, ctx: Ctx) => part(ref, 'R', ideal, nearest(ideal, ctx.rs))
const C = (ref: string, ideal: number, ctx: Ctx) => part(ref, 'C', ideal, nearest(ideal, ctx.cs))
const vals = (parts: Part[]) => Object.fromEntries(parts.map((p) => [p.ref, p.value])) as Record<string, number>
const r = (ref: string, a: string, b: string, v: Record<string, number>): Elem => ({ t: 'R', a, b, v: v[ref] })
const c = (ref: string, a: string, b: string, v: Record<string, number>): Elem => ({ t: 'C', a, b, v: v[ref] })
const oa = (p: string, n: string, o: string): Elem => ({ t: 'OA', p, n, o })
const warn = (text: string, ...args: (string | number)[]): Note => ({ text, args, tone: 'warn' })
const info = (text: string, ...args: (string | number)[]): Note => ({ text, args, tone: 'info' })
const errTone = (e: number, ok: number, bad: number): 'ok' | 'warn' | 'err' => (Math.abs(e) <= ok ? 'ok' : Math.abs(e) <= bad ? 'warn' : 'err')

/** Frequency sweep top for amplifiers: the decade above ~3x the op-amp GBW. */
const ampFmax = (op: OpAmp) => 10 ** Math.ceil(Math.log10(Math.max(op.gbw * 3, 1e4)))

/** Worst-case DC gain change over all +-tol resistor corners (ideal op-amp), as a fraction. */
export function worstCaseGain(build: (v: Record<string, number>) => Circuit, parts: Part[], tol: number): number {
  const rs = parts.filter((p) => p.kind === 'R')
  const base = vals(parts)
  const nominal = transfer(build(base), IDEAL, 1)[0]
  let worst = 0
  for (let m = 0; m < 1 << rs.length; m++) {
    const v = { ...base }
    rs.forEach((p, i) => (v[p.ref] = p.value * (m & (1 << i) ? 1 + tol : 1 - tol)))
    worst = Math.max(worst, Math.abs(transfer(build(v), IDEAL, 1)[0] / nominal - 1))
  }
  return worst
}

type AmpOut = { resp: Response; ideal: Response; dcIdeal: number; dcActual: number; bw: number | undefined; chart: Chart }

function ampAnalysis(build: (v: Record<string, number>) => Circuit, parts: Part[], ctx: Ctx, fmax = ampFmax(ctx.op)): AmpOut {
  const circ = build(vals(parts))
  const f = logspace(1, fmax, 20)
  const resp = sweep(circ, ctx.op, f)
  const ideal = sweep(circ, IDEAL, f)
  const dcIdeal = transfer(circ, IDEAL, 1)[0]
  const dcActual = transfer(circ, ctx.op, 1)[0]
  const bw = crossDown(f, resp.mag, resp.mag[0] - 3)
  const marks = bw ? [{ f: bw, label: '−3 dB' }] : []
  return { resp, ideal, dcIdeal, dcActual, bw, chart: { type: 'bode', resp, ideal, marks } }
}

function gainSpecs(a: AmpOut, target: number, ctx: Ctx, build: (v: Record<string, number>) => Circuit, parts: Part[]): Spec[] {
  const err = (a.dcActual / target - 1) * 100
  const wc = worstCaseGain(build, parts, ctx.tol) * 100
  return [
    { label: N('Gain (V/V)'), value: fmtNum(a.dcActual, 4) },
    { label: N('Gain (dB)'), value: fmtDb(db(a.dcActual)) },
    { label: N('Error vs target'), value: fmtPct(err), tone: errTone(err, 1, 5) },
    { label: N('Worst-case gain error'), value: `±${fmtNum(wc, 3)} %`, tone: errTone(wc, 2 * ctx.tol * 100 + 0.01, 10) },
    { label: N('Bandwidth (−3 dB)'), value: a.bw ? fmtHz(a.bw) : '> ' + fmtHz(a.resp.f[a.resp.f.length - 1]) },
  ]
}

function bwNote(a: AmpOut, ctx: Ctx, noiseGain: number, notes: Note[]) {
  notes.push(info('Noise gain {0}: the closed-loop bandwidth is about GBW / noise gain = {1}.', fmtNum(noiseGain, 4), fmtHz(ctx.op.gbw / noiseGain)))
  if (a.bw && a.bw < 20e3) notes.push(warn('Bandwidth is below 20 kHz: pick a faster op-amp or split the gain over two stages.'))
}

// ---------------------------------------------------------------- amplifiers

const inverting: CircuitDef = {
  kind: 'inverting',
  title: N('Inverting amplifier'),
  blurb: N('Vout = −(Rf / R1) · Vin. Input resistance equals R1.'),
  params: [
    { key: 'gain', label: N('Gain magnitude'), unit: '', def: 10, min: 0.01, max: 1e5, hint: N('Output is inverted: the gain is −G.') },
    { key: 'rin', label: N('Input resistance R1'), unit: 'Ω', def: 10e3, min: 10, max: 10e6 },
  ],
  design(p, ctx) {
    const { a, b } = bestPair(p.gain, ctx.rs, p.rin)
    const parts = [part('R1', 'R', p.rin, a), part('Rf', 'R', p.gain * p.rin, b)]
    const build = (v: Record<string, number>): Circuit => ({
      elems: [r('R1', 'in', 'n', v), r('Rf', 'n', 'out', v), oa('0', 'n', 'out')],
      drive: { in: 1 },
      out: 'out',
    })
    const an = ampAnalysis(build, parts, ctx)
    const ng = 1 + b / a
    const notes: Note[] = []
    bwNote(an, ctx, ng, notes)
    const specs = [...gainSpecs(an, -p.gain, ctx, build, parts), { label: N('Input resistance'), value: fmtU(a, 'Ω') }]
    return { parts, specs, notes, chart: an.chart, flags: {} }
  },
}

const noninverting: CircuitDef = {
  kind: 'noninverting',
  title: N('Non-inverting amplifier'),
  blurb: N('Vout = (1 + Rf / R1) · Vin. Very high input resistance.'),
  params: [
    { key: 'gain', label: N('Gain'), unit: '', def: 11, min: 1.01, max: 1e5, hint: N('At least 1.01. For a unity-gain follower connect the output straight to the − input.') },
    { key: 'r1', label: N('Resistor R1 (to ground)'), unit: 'Ω', def: 10e3, min: 10, max: 10e6 },
  ],
  design(p, ctx) {
    const { a, b } = bestPair(p.gain - 1, ctx.rs, p.r1)
    const parts = [part('R1', 'R', p.r1, a), part('Rf', 'R', (p.gain - 1) * p.r1, b)]
    const build = (v: Record<string, number>): Circuit => ({
      elems: [r('R1', 'n', '0', v), r('Rf', 'n', 'out', v), oa('in', 'n', 'out')],
      drive: { in: 1 },
      out: 'out',
    })
    const an = ampAnalysis(build, parts, ctx)
    const notes: Note[] = []
    bwNote(an, ctx, 1 + b / a, notes)
    return { parts, specs: gainSpecs(an, p.gain, ctx, build, parts), notes, chart: an.chart, flags: {} }
  },
}

const differential: CircuitDef = {
  kind: 'differential',
  title: N('Difference amplifier'),
  blurb: N('Vout = (R2 / R1) · (V2 − V1) with R3 = R1 and R4 = R2.'),
  params: [
    { key: 'gain', label: N('Differential gain'), unit: '', def: 5, min: 0.01, max: 1e4 },
    { key: 'rin', label: N('Input resistor R1 = R3'), unit: 'Ω', def: 10e3, min: 10, max: 10e6 },
  ],
  design(p, ctx) {
    const { a, b } = bestPair(p.gain, ctx.rs, p.rin)
    const parts = [part('R1', 'R', p.rin, a), part('R2', 'R', p.gain * p.rin, b), part('R3', 'R', p.rin, a), part('R4', 'R', p.gain * p.rin, b)]
    const build = (v: Record<string, number>): Circuit => ({
      elems: [r('R1', 'in1', 'n', v), r('R2', 'n', 'out', v), r('R3', 'in2', 'p', v), r('R4', 'p', '0', v), oa('p', 'n', 'out')],
      drive: { in2: 1, in1: 0 },
      out: 'out',
    })
    const an = ampAnalysis(build, parts, ctx)
    const cmrr = db((1 + b / a) / (4 * ctx.tol))
    const specs = [
      ...gainSpecs(an, p.gain, ctx, build, parts),
      { label: N('Differential input resistance'), value: fmtU(2 * a, 'Ω') },
      { label: N('CMRR from resistor tolerance (worst case)'), value: fmtDb(cmrr) },
    ]
    const notes: Note[] = []
    bwNote(an, ctx, 1 + b / a, notes)
    notes.push(info('Matched resistors set the common-mode rejection: use 0.1 % parts or a resistor network for better than {0}.', fmtDb(cmrr)))
    return { parts, specs, notes, chart: an.chart, flags: {} }
  },
}

const instrumentation: CircuitDef = {
  kind: 'instrumentation',
  title: N('Instrumentation amplifier'),
  blurb: N('Three op-amps: G = 1 + 2R / Rg, followed by a unity-gain difference stage.'),
  params: [
    { key: 'gain', label: N('Gain'), unit: '', def: 100, min: 2, max: 1e5 },
    { key: 'r', label: N('Input-stage resistor R1 = R2'), unit: 'Ω', def: 25e3, min: 100, max: 1e6 },
    { key: 'rd', label: N('Difference-stage resistors R3 to R6'), unit: 'Ω', def: 10e3, min: 1e3, max: 1e6 },
  ],
  design(p, ctx) {
    const { a, b } = bestPair(2 / (p.gain - 1), ctx.rs, p.r)
    const rd = nearest(p.rd, ctx.rs)
    const parts = [part('R1', 'R', p.r, a), part('R2', 'R', p.r, a), part('Rg', 'R', (2 * p.r) / (p.gain - 1), b)]
    for (const k of [3, 4, 5, 6]) parts.push(part('R' + k, 'R', p.rd, rd))
    const build = (v: Record<string, number>): Circuit => ({
      elems: [
        oa('in1', 'g1', 'o1'),
        oa('in2', 'g2', 'o2'),
        r('R1', 'o1', 'g1', v),
        r('Rg', 'g1', 'g2', v),
        r('R2', 'g2', 'o2', v),
        r('R3', 'o1', 'n3', v),
        r('R4', 'n3', 'out', v),
        r('R5', 'o2', 'p3', v),
        r('R6', 'p3', '0', v),
        oa('p3', 'n3', 'out'),
      ],
      drive: { in2: 0.5, in1: -0.5 },
      out: 'out',
    })
    const an = ampAnalysis(build, parts, ctx)
    const g1 = 1 + (2 * a) / b
    const specs = [
      ...gainSpecs(an, p.gain, ctx, build, parts),
      { label: N('First-stage gain'), value: fmtNum(g1, 4) },
    ]
    const notes: Note[] = [info('R1 = R2 must match; the gain is set by the single resistor Rg. A trimmer in series with Rg trims the gain.')]
    bwNote(an, ctx, g1, notes)
    return { parts, specs, notes, chart: an.chart, flags: {} }
  },
}

const summing: CircuitDef = {
  kind: 'summing',
  title: N('Summing amplifier'),
  blurb: N('Vout = −(Rf/R1 · V1 + Rf/R2 · V2 + Rf/R3 · V3). Each input has its own weight.'),
  params: [
    { key: 'g1', label: N('Gain of input 1'), unit: '', def: 1, min: 0.01, max: 1e3 },
    { key: 'g2', label: N('Gain of input 2'), unit: '', def: 2, min: 0.01, max: 1e3 },
    { key: 'g3', label: N('Gain of input 3'), unit: '', def: 4, min: 0.01, max: 1e3 },
    { key: 'rf', label: N('Feedback resistor Rf'), unit: 'Ω', def: 10e3, min: 100, max: 10e6 },
  ],
  design(p, ctx) {
    const rf = nearest(p.rf, ctx.rs)
    const parts = [part('Rf', 'R', p.rf, rf)]
    const gs = [p.g1, p.g2, p.g3]
    gs.forEach((g, i) => parts.push(part('R' + (i + 1), 'R', p.rf / g, nearest(rf / g, ctx.rs))))
    const build = (v: Record<string, number>): Circuit => ({
      elems: [r('R1', 'in', 'n', v), r('R2', 'in2', 'n', v), r('R3', 'in3', 'n', v), r('Rf', 'n', 'out', v), oa('0', 'n', 'out')],
      drive: { in: 1, in2: 0, in3: 0 },
      out: 'out',
    })
    const an = ampAnalysis(build, parts, ctx)
    const actual = [1, 2, 3].map((i) => rf / parts[i].value)
    const par = 1 / (1 / parts[1].value + 1 / parts[2].value + 1 / parts[3].value)
    const ng = 1 + rf / par
    const wc = worstCaseGain(build, parts, ctx.tol) * 100
    const specs: Spec[] = [
      { label: N('Gains (V/V)'), value: actual.map((g) => '−' + fmtNum(g, 4)).join(', ') },
      { label: N('Gain error vs target'), value: actual.map((g, i) => fmtPct((g / gs[i] - 1) * 100, 2)).join(', ') },
      { label: N('Worst-case gain error'), value: `±${fmtNum(wc, 3)} %`, tone: errTone(wc, 2 * ctx.tol * 100 + 0.01, 10) },
      { label: N('Bandwidth (−3 dB)'), value: an.bw ? fmtHz(an.bw) : '> ' + fmtHz(an.resp.f[an.resp.f.length - 1]) },
    ]
    const notes: Note[] = []
    bwNote(an, ctx, ng, notes)
    notes.push(info('The response plot follows input 1; every input has its own gain but the same bandwidth.'))
    return { parts, specs, notes, chart: an.chart, flags: { inputs: 3 } }
  },
}

const integrator: CircuitDef = {
  kind: 'integrator',
  title: N('Integrator'),
  blurb: N('Vout = −1/(R·C) ∫Vin dt. A resistor across C limits the DC gain so the output cannot drift into the rails.'),
  params: [
    { key: 'fu', label: N('Unity-gain frequency'), unit: 'Hz', def: 1e3, min: 0.01, max: 1e7, hint: N('f = 1 / (2π R C)') },
    { key: 'r', label: N('Input resistor R'), unit: 'Ω', def: 10e3, min: 100, max: 10e6 },
    { key: 'dc', label: N('DC gain limit Rf / R'), unit: '', def: 100, min: 0, max: 1e5, hint: N('0 = no resistor across C (ideal integrator, will drift).') },
  ],
  design(p, ctx) {
    const R1 = nearest(p.r, ctx.rs)
    const cap = C('C1', 1 / (TAU * p.fu * R1), ctx)
    const parts = [part('R1', 'R', p.r, R1), cap]
    const hasRf = p.dc > 0
    if (hasRf) parts.push(R('Rf', p.dc * R1, ctx))
    const build = (v: Record<string, number>): Circuit => ({
      elems: [r('R1', 'in', 'n', v), c('C1', 'n', 'out', v), ...(hasRf ? [r('Rf', 'n', 'out', v)] : []), oa('0', 'n', 'out')],
      drive: { in: 1 },
      out: 'out',
    })
    const fuA = 1 / (TAU * R1 * cap.value)
    const fl = hasRf ? 1 / (TAU * parts[2].value * cap.value) : 0
    const fmin = Math.max(fuA / 1e4, 0.001)
    const fmax = Math.min(Math.max(fuA * 100, 10), Math.max(ctx.op.gbw * 3, 1e4))
    const circ = build(vals(parts))
    const f = logspace(fmin, Math.max(fmax, fmin * 100), 20)
    const resp = sweep(circ, ctx.op, f)
    const ideal = sweep(circ, IDEAL, f)
    const marks = [{ f: fuA, label: '0 dB' }]
    const specs: Spec[] = [
      { label: N('Unity-gain frequency'), value: fmtHz(fuA) },
      { label: N('Time constant R·C'), value: fmtU(R1 * cap.value, 's') },
      { label: N('Slope'), value: '−20 dB/dec' },
    ]
    if (hasRf) {
      specs.push({ label: N('DC gain'), value: fmtDb(db(parts[2].value / R1)) })
      specs.push({ label: N('Integrates above'), value: fmtHz(fl) })
    }
    const notes: Note[] = [info('Below the corner the stage behaves like an inverting amplifier; above it the stage integrates.')]
    if (!hasRf) notes.push(warn('Without Rf any input offset or bias current integrates until the output saturates; add a reset switch or set a DC gain limit.'))
    if (fuA > ctx.op.gbw / 20) notes.push(warn('The unity-gain frequency is close to the op-amp GBW; the integrator will not follow the ideal curve.'))
    return { parts, specs, notes, chart: { type: 'bode', resp, ideal, marks }, flags: { rf: hasRf } }
  },
}

// ---------------------------------------------------------------- filters

const Q_PRESETS = [
  { label: N('Bessel'), v: 0.5774 },
  { label: N('Butterworth'), v: 0.7071 },
  { label: N('Chebyshev 1 dB'), v: 0.9565 },
  { label: N('Chebyshev 3 dB'), v: 1.3049 },
]

function filterAnalysis(build: (v: Record<string, number>) => Circuit, parts: Part[], ctx: Ctx, f0: number, shape: 'lp' | 'hp' | 'bp') {
  const circ = build(vals(parts))
  const f = logspace(f0 / 100, f0 * 100, 24)
  const resp = sweep(circ, ctx.op, f)
  const ideal = sweep(circ, IDEAL, f)
  const measure = (s: Response) => {
    const peak = Math.max(...s.mag)
    const fPeak = s.f[s.mag.indexOf(peak)]
    if (shape === 'lp') return { f3: crossDown(s.f, s.mag, s.mag[0] - 3), pass: s.mag[0], peak, fPeak }
    if (shape === 'hp') return { f3: crossUp(s.f, s.mag, s.mag[s.mag.length - 1] - 3), pass: s.mag[s.mag.length - 1], peak, fPeak }
    return { f3: fPeak, pass: peak, peak, fPeak }
  }
  const act = measure(resp)
  const idl = measure(ideal)
  const marks = act.f3 ? [{ f: act.f3, label: shape === 'bp' ? 'f0' : '−3 dB' }] : []
  const dev = act.f3 && idl.f3 ? (act.f3 / idl.f3 - 1) * 100 : 0
  return { resp, ideal, act, idl, marks, dev }
}

function filterResult(
  parts: Part[],
  build: (v: Record<string, number>) => Circuit,
  ctx: Ctx,
  tgt: { f0: number; q: number },
  actual: { f0: number; q: number; gain: number },
  shape: 'lp' | 'hp' | 'bp',
  flags: Design['flags'],
): Design {
  const a = filterAnalysis(build, parts, ctx, tgt.f0, shape)
  const ef0 = (actual.f0 / tgt.f0 - 1) * 100
  const eq = (actual.q / tgt.q - 1) * 100
  const specs: Spec[] = [
    { label: N('Natural frequency f0'), value: fmtHz(actual.f0) },
    { label: N('f0 error vs target'), value: fmtPct(ef0), tone: errTone(ef0, 2, 6) },
    { label: N('Q'), value: fmtNum(actual.q, 4) },
    { label: N('Q error vs target'), value: fmtPct(eq), tone: errTone(eq, 5, 15) },
    { label: shape === 'bp' ? N('Gain at f0') : N('Passband gain'), value: fmtNum(actual.gain, 4) + ' (' + fmtDb(db(actual.gain)) + ')' },
  ]
  if (shape === 'bp') {
    specs.push({ label: N('Bandwidth (−3 dB)'), value: fmtHz(actual.f0 / actual.q) })
  } else {
    if (a.act.f3) specs.push({ label: N('−3 dB frequency'), value: fmtHz(a.act.f3) })
    const peaking = a.idl.peak - a.idl.pass
    if (peaking > 0.05) specs.push({ label: N('Peaking'), value: fmtDb(peaking) })
  }
  const notes: Note[] = [info('f0 is the natural (pole) frequency. It equals the −3 dB point only for Butterworth (Q = 0.707).')]
  if (Math.abs(a.dev) > 3 || ctx.op.gbw < 50 * tgt.f0 * Math.max(1, actual.q)) {
    notes.push(
      warn('With GBW = {0} the corner moves by {1} compared with an ideal op-amp. Use an op-amp with at least {2} GBW.', fmtHz(ctx.op.gbw), fmtPct(a.dev, 2), fmtHz(100 * tgt.f0 * Math.max(1, actual.q))),
    )
  }
  return { parts, specs, notes, chart: { type: 'bode', resp: a.resp, ideal: a.ideal, marks: a.marks }, flags }
}

const filterParams = (qDef: number, cDef: number, extra: ParamDef[] = []): ParamDef[] => [
  { key: 'f0', label: N('Natural frequency f0'), unit: 'Hz', def: 1e3, min: 1, max: 1e6 },
  { key: 'q', label: N('Quality factor Q'), unit: '', def: qDef, min: 0.5, max: 50, presets: Q_PRESETS },
  { key: 'cap', label: N('Capacitor (starting value)'), unit: 'F', def: cDef, min: 10e-12, max: 100e-6, hint: N('Resistors are computed from it. Pick 1 nF to 100 nF for most designs.') },
  ...extra,
]

const MODE_OPTIONS = [
  { v: 0, label: N('Unity gain (unequal capacitors or resistors)') },
  { v: 1, label: N('Equal components (gain 3 − 1/Q)') },
]

function skDesign(hp: boolean) {
  return (p: Params, ctx: Ctx): Design => {
    const w0 = TAU * p.f0
    const equal = p.mode === 1
    const q = p.q
    let parts: Part[]
    let build: (v: Record<string, number>) => Circuit
    let actual: { f0: number; q: number; gain: number }
    if (!equal) {
      if (!hp) {
        // pick the capacitor pair whose ratio is closest to 4Q² (it sets Q)
        const pair = bestPair(4 * q * q, ctx.cs, p.cap)
        const c2 = part('C2', 'C', p.cap, pair.a)
        const c1 = part('C1', 'C', 4 * q * q * p.cap, pair.b)
        const rr = 1 / (w0 * Math.sqrt(c1.value * c2.value))
        const r1 = R('R1', rr, ctx)
        const r2 = R('R2', rr, ctx)
        parts = [r1, r2, c1, c2]
        build = (v) => ({ elems: [r('R1', 'in', 'a', v), r('R2', 'a', 'p', v), c('C1', 'a', 'out', v), c('C2', 'p', '0', v), oa('p', 'out', 'out')], drive: { in: 1 }, out: 'out' })
        actual = skLpFormula(r1.value, r2.value, c1.value, c2.value, 1)
      } else {
        const cc = nearest(p.cap, ctx.cs)
        const r2i = 1 / (w0 * cc * 2 * q)
        const r2 = R('R2', r2i, ctx)
        const r1 = R('R1', 4 * q * q * r2i, ctx)
        parts = [r1, r2, part('C1', 'C', p.cap, cc), part('C2', 'C', p.cap, cc)]
        build = (v) => ({ elems: [c('C1', 'in', 'a', v), c('C2', 'a', 'p', v), r('R1', 'a', 'out', v), r('R2', 'p', '0', v), oa('p', 'out', 'out')], drive: { in: 1 }, out: 'out' })
        actual = skHpFormula(r1.value, r2.value, cc, cc, 1)
      }
    } else {
      const cc = nearest(p.cap, ctx.cs)
      const rr = R('R1', 1 / (w0 * cc), ctx)
      const kMinus1 = Math.max(2 - 1 / q, 0.01)
      const { a, b } = bestPair(kMinus1, ctx.rs, rr.value)
      const K = 1 + b / a
      parts = [rr, part('R2', 'R', rr.ideal, rr.value), part('C1', 'C', p.cap, cc), part('C2', 'C', p.cap, cc), part('Ra', 'R', rr.value, a), part('Rb', 'R', rr.value * kMinus1, b)]
      build = (v) =>
        hp
          ? { elems: [c('C1', 'in', 'a', v), c('C2', 'a', 'p', v), r('R1', 'a', 'out', v), r('R2', 'p', '0', v), r('Ra', 'n', '0', v), r('Rb', 'n', 'out', v), oa('p', 'n', 'out')], drive: { in: 1 }, out: 'out' }
          : { elems: [r('R1', 'in', 'a', v), r('R2', 'a', 'p', v), c('C1', 'a', 'out', v), c('C2', 'p', '0', v), r('Ra', 'n', '0', v), r('Rb', 'n', 'out', v), oa('p', 'n', 'out')], drive: { in: 1 }, out: 'out' }
      actual = (hp ? skHpFormula : skLpFormula)(rr.value, rr.value, cc, cc, K)
    }
    const d = filterResult(parts, build, ctx, { f0: p.f0, q }, actual, hp ? 'hp' : 'lp', { equal })
    if (equal && actual.q > 1.5) d.notes.push(warn('High-Q equal-component filters are sensitive: Q = 1/(3 − K), so a 1 % gain error moves Q a lot.'))
    return d
  }
}

const skLp: CircuitDef = {
  kind: 'skLp',
  title: N('Sallen-Key low-pass'),
  blurb: N('Second-order low-pass, one op-amp, non-inverting. Two resistors and two capacitors set f0 and Q.'),
  params: filterParams(0.7071, 10e-9, [{ key: 'mode', label: N('Design'), unit: '', def: 0, min: 0, max: 1, options: MODE_OPTIONS }]),
  design: skDesign(false),
}

const skHp: CircuitDef = {
  kind: 'skHp',
  title: N('Sallen-Key high-pass'),
  blurb: N('Second-order high-pass, one op-amp, non-inverting. The resistors and capacitors swap places compared with the low-pass.'),
  params: filterParams(0.7071, 10e-9, [{ key: 'mode', label: N('Design'), unit: '', def: 0, min: 0, max: 1, options: MODE_OPTIONS }]),
  design: skDesign(true),
}

const mfbLp: CircuitDef = {
  kind: 'mfbLp',
  title: N('Multiple-feedback low-pass'),
  blurb: N('Second-order inverting low-pass (Rauch). Good for higher Q with a low component spread.'),
  params: filterParams(0.7071, 10e-9, [{ key: 'gain', label: N('DC gain magnitude'), unit: '', def: 1, min: 0.1, max: 100 }]),
  design(p, ctx) {
    const w0 = TAU * p.f0
    const K = p.gain
    const c2 = C('C2', p.cap, ctx)
    // the grounded capacitor C1 must be at least 4Q²(K+1) times the capacitor C2 across the amplifier
    const limit = c2.value * 4 * p.q * p.q * (K + 1)
    const c1v = ceilTo(limit, ctx.cs)
    const c1 = part('C1', 'C', limit, c1v)
    const S = 1 / (p.q * w0 * c2.value)
    const Pp = 1 / (w0 * w0 * c1v * c2.value)
    const disc = Math.max(S * S - 4 * (K + 1) * Pp, 0)
    const r2i = (S - Math.sqrt(disc)) / (2 * (K + 1))
    const r3i = (S + Math.sqrt(disc)) / 2
    const r1i = r3i / K
    const parts = [R('R1', r1i, ctx), R('R2', r2i, ctx), R('R3', r3i, ctx), c1, c2]
    const build = (v: Record<string, number>): Circuit => ({
      elems: [r('R1', 'in', 'a', v), r('R2', 'a', 'n', v), r('R3', 'a', 'out', v), c('C1', 'a', '0', v), c('C2', 'n', 'out', v), oa('0', 'n', 'out')],
      drive: { in: 1 },
      out: 'out',
    })
    const v = vals(parts)
    const actual = mfbLpFormula(v.R1, v.R2, v.R3, v.C1, v.C2)
    return filterResult(parts, build, ctx, { f0: p.f0, q: p.q }, { ...actual, gain: -actual.gain }, 'lp', {})
  },
}

const mfbBp: CircuitDef = {
  kind: 'mfbBp',
  title: N('Multiple-feedback band-pass'),
  blurb: N('Second-order inverting band-pass with equal capacitors. Centre frequency, Q and gain at f0 are set independently.'),
  params: [
    { key: 'f0', label: N('Centre frequency f0'), unit: 'Hz', def: 1e3, min: 1, max: 1e6 },
    { key: 'q', label: N('Quality factor Q'), unit: '', def: 5, min: 0.5, max: 100 },
    { key: 'gain', label: N('Gain at f0'), unit: '', def: 2, min: 0.1, max: 100, hint: N('Must be below 2·Q².') },
    { key: 'cap', label: N('Capacitor C1 = C2'), unit: 'F', def: 10e-9, min: 10e-12, max: 100e-6 },
  ],
  design(p, ctx) {
    const cc = nearest(p.cap, ctx.cs)
    const r3i = p.q / (Math.PI * p.f0 * cc)
    const r1i = r3i / (2 * p.gain)
    const r2i = r3i / (4 * p.q * p.q - 2 * p.gain)
    const parts = [R('R1', r1i, ctx), R('R2', r2i, ctx), R('R3', r3i, ctx), part('C1', 'C', p.cap, cc), part('C2', 'C', p.cap, cc)]
    const build = (v: Record<string, number>): Circuit => ({
      elems: [r('R1', 'in', 'a', v), c('C1', 'a', 'n', v), c('C2', 'a', 'out', v), r('R2', 'a', '0', v), r('R3', 'n', 'out', v), oa('0', 'n', 'out')],
      drive: { in: 1 },
      out: 'out',
    })
    const v = vals(parts)
    const actual = mfbBpFormula(v.R1, v.R2, v.R3, v.C1, v.C2)
    return filterResult(parts, build, ctx, { f0: p.f0, q: p.q }, { ...actual, gain: -actual.gain }, 'bp', {})
  },
}

// ---------------------------------------------------------------- comparator

const schmitt: CircuitDef = {
  kind: 'schmitt',
  title: N('Comparator with hysteresis'),
  blurb: N('Inverting Schmitt trigger: positive feedback R1 from the output sets two switching thresholds, so noise cannot cause chatter.'),
  params: [
    { key: 'vhi', label: N('Output high level'), unit: 'V', def: 5, min: -50, max: 50, hint: N('Supply rail the output swings to (rail-to-rail output assumed).') },
    { key: 'vlo', label: N('Output low level'), unit: 'V', def: 0, min: -50, max: 50 },
    { key: 'center', label: N('Centre of thresholds'), unit: 'V', def: 2.5, min: -50, max: 50 },
    { key: 'hyst', label: N('Hysteresis width'), unit: 'V', def: 0.5, min: 0.001, max: 50 },
    { key: 'r1', label: N('Feedback resistor R1'), unit: 'Ω', def: 100e3, min: 100, max: 100e6 },
  ],
  design(p, ctx) {
    const span = p.vhi - p.vlo
    const mid = (p.vhi + p.vlo) / 2
    const beta = p.hyst / span
    const R1 = nearest(p.r1, ctx.rs)
    const r2eff = (R1 * beta) / (1 - beta)
    const vrefIdeal = (p.center - mid * beta) / (1 - beta)
    // Vref comes from a divider between the two rails when it is not 0 V.
    const useDiv = Math.abs(vrefIdeal) > 1e-3
    const parts: Part[] = [part('R1', 'R', p.r1, R1)]
    let rth = 0
    let vref = 0
    if (useDiv) {
      const x = (vrefIdeal - p.vlo) / span
      if (x > 0.001 && x < 0.999) {
        const { a, b } = bestPair((1 - x) / x, ctx.rs, Math.max(r2eff / 5, 100))
        rth = (a * b) / (a + b)
        vref = p.vlo + (span * b) / (a + b)
        parts.push(R('R2', Math.max(r2eff - rth, 1), ctx), part('Ra', 'R', a, a), part('Rb', 'R', b, b))
      } else {
        parts.push(R('R2', r2eff, ctx))
        vref = x <= 0.001 ? p.vlo : p.vhi
      }
    } else parts.push(R('R2', r2eff, ctx))
    const r2 = parts.find((q) => q.ref === 'R2')!.value + rth
    const th = schmittThresholds(R1, r2, vref, p.vhi, p.vlo)
    const hyst = th.vth - th.vtl
    const center = (th.vth + th.vtl) / 2
    const specs: Spec[] = [
      { label: N('Upper threshold (output goes low)'), value: fmtNum(th.vth, 4) + ' V' },
      { label: N('Lower threshold (output goes high)'), value: fmtNum(th.vtl, 4) + ' V' },
      { label: N('Hysteresis'), value: fmtNum(hyst * 1000, 4) + ' mV', tone: errTone(hyst / p.hyst - 1, 0.05, 0.2) },
      { label: N('Centre'), value: fmtNum(center, 4) + ' V', tone: errTone(center - p.center, 0.02 * Math.max(Math.abs(p.center), 0.5), 0.1 * Math.max(Math.abs(p.center), 0.5)) },
      { label: N('Reference voltage Vref'), value: fmtNum(vref, 4) + ' V' },
    ]
    const notes: Note[] = [info('Feedback fraction β = R2 / (R1 + R2) = {0}. The input must swing past both thresholds to toggle the output.', fmtNum(th.beta, 4))]
    if (!useDiv) notes.push(info('Vref is 0 V: connect R2 straight to ground.'))
    else notes.push(info('Vref is made with the divider Ra (to the high level) and Rb (to the low level). Decouple it with 100 nF.'))
    if (R1 + r2 < 10e3) notes.push(warn('R1 + R2 is small: the output must drive this load, which may pull it away from the rail.'))
    return { parts, specs, notes, chart: { type: 'hyst', vth: th.vth, vtl: th.vtl, vhi: p.vhi, vlo: p.vlo }, flags: { vref: useDiv ? fmtNum(vref, 3) + ' V' : '0' } }
  },
}

export const CIRCUITS: Record<Kind, CircuitDef> = { inverting, noninverting, differential, instrumentation, summing, integrator, skLp, skHp, mfbLp, mfbBp, schmitt }

export const defaultParams = (kind: Kind): Params => Object.fromEntries(CIRCUITS[kind].params.map((p) => [p.key, p.def]))

/** Invalid fields (out of range or not a number) plus cross-field problems. */
export function validate(kind: Kind, p: Params): { bad: Set<string>; message?: string } {
  const bad = new Set<string>()
  for (const d of CIRCUITS[kind].params) {
    const v = p[d.key]
    if (typeof v !== 'number' || !Number.isFinite(v) || v < d.min || v > d.max) bad.add(d.key)
  }
  let message: string | undefined
  if (bad.size === 0) {
    if (kind === 'mfbBp' && p.gain >= 2 * p.q * p.q) {
      bad.add('gain')
      bad.add('q')
      message = N('The gain at f0 must be below 2·Q².')
    }
    if (kind === 'schmitt') {
      if (p.vhi <= p.vlo) {
        bad.add('vhi')
        bad.add('vlo')
        message = N('The high level must be above the low level.')
      } else if (p.hyst >= p.vhi - p.vlo) {
        bad.add('hyst')
        message = N('Hysteresis must be smaller than the output swing.')
      }
    }
  }
  return { bad, message }
}
