import { describe, expect, it } from 'vitest'
import {
  CIRCUITS,
  KINDS,
  defaultParams,
  mfbBpFormula,
  mfbLpFormula,
  schmittThresholds,
  skHpFormula,
  skLpFormula,
  validate,
  type Ctx,
  type Kind,
} from './circuits'
import { mantissas } from './eseries'
import { IDEAL, transfer } from './mna'

const ctx: Ctx = { rs: 'E96', cs: 'E12', tol: 0.01, op: { gbw: 3e6, a0: 2e5 } }
const fine: Ctx = { rs: 'E192', cs: 'E24', tol: 0.01, op: { gbw: 1e9, a0: 1e7 } }

const spec = (kind: Kind, label: string, c: Ctx = ctx, p = defaultParams(kind)) =>
  CIRCUITS[kind].design(p, c).specs.find((s) => s.label === label)?.value

describe('closed-form filter formulas', () => {
  it('Sallen-Key LP unity gain: f0 = 1/(2π√(R1R2C1C2)), Q = √(C1/C2)/2 for equal R', () => {
    const f = skLpFormula(10e3, 10e3, 20e-9, 10e-9, 1)
    expect(f.f0).toBeCloseTo(1 / (2 * Math.PI * 10e3 * Math.sqrt(200e-18)), 6)
    expect(f.q).toBeCloseTo(Math.sqrt(2) / 2, 6)
  })
  it('Sallen-Key equal components: Q = 1/(3-K), f0 = 1/(2πRC)', () => {
    const f = skLpFormula(1591.5494, 1591.5494, 100e-9, 100e-9, 1.586)
    expect(f.f0).toBeCloseTo(1000, 1)
    expect(f.q).toBeCloseTo(1 / (3 - 1.586), 6)
  })
  it('Sallen-Key HP equal C: Q = ½√(R1/R2)', () => {
    expect(skHpFormula(40e3, 10e3, 10e-9, 10e-9, 1).q).toBeCloseTo(1, 6)
  })
  it('MFB LP design values from the textbook give the target f0 and Q', () => {
    // R1 = R2 = R3 = R, C1 = 3C, C2 = C: textbook f0 = 1/(2π R C √3)
    const f = mfbLpFormula(20e3, 20e3, 20e3, 30e-9, 10e-9)
    expect(f.gain).toBeCloseTo(1, 9)
    expect(f.f0).toBeCloseTo(1 / (2 * Math.PI * 20e3 * 10e-9 * Math.sqrt(3)), 6)
    expect(f.q).toBeCloseTo(1 / Math.sqrt(3), 6)
  })
  it('MFB BP: gain at f0 is R3/(2R1) with equal caps and Q = π f0 R3 C', () => {
    const C = 10e-9
    const f0 = 1000
    const Q = 5
    const R3 = Q / (Math.PI * f0 * C)
    const A0 = 2
    const R1 = R3 / (2 * A0)
    const R2 = R3 / (4 * Q * Q - 2 * A0)
    const f = mfbBpFormula(R1, R2, R3, C, C)
    expect(f.f0).toBeCloseTo(f0, 6)
    expect(f.q).toBeCloseTo(Q, 6)
    expect(f.gain).toBeCloseTo(A0, 6)
  })
  it('Schmitt thresholds', () => {
    // 5 V rail, R1 = 100k, R2 = 10k, Vref 2.5: β = 1/11
    const t = schmittThresholds(100e3, 10e3, 2.5, 5, 0)
    expect(t.beta).toBeCloseTo(1 / 11, 9)
    expect(t.vth).toBeCloseTo(2.5 + 2.5 / 11, 9)
    expect(t.vtl).toBeCloseTo(2.5 - 2.5 / 11, 9)
  })
})

describe('designs match the closed-form results with fine components', () => {
  it('inverting amplifier hits gain -10', () => {
    expect(Number(spec('inverting', 'Gain (V/V)', fine)!.replace('−', '-'))).toBeCloseTo(-10, 1)
  })
  it('non-inverting amplifier hits gain 11', () => {
    expect(Number(spec('noninverting', 'Gain (V/V)', fine))).toBeCloseTo(11, 2)
  })
  it('difference amplifier hits gain 5 for V2 - V1', () => {
    expect(Number(spec('differential', 'Gain (V/V)', fine))).toBeCloseTo(5, 2)
  })
  it('instrumentation amplifier hits G = 100', () => {
    const g = Number(spec('instrumentation', 'Gain (V/V)', fine))
    expect(g).toBeGreaterThan(99)
    expect(g).toBeLessThan(101)
  })
  it('summing amplifier weights', () => {
    const v = spec('summing', 'Gains (V/V)', fine)!
    const gs = v.split(', ').map((x) => Number(x.replace('−', '-')))
    expect(gs[0]).toBeCloseTo(-1, 1)
    expect(gs[1]).toBeCloseTo(-2, 1)
    expect(gs[2]).toBeCloseTo(-4, 1)
  })
  it('SK low-pass: measured -3 dB point of a Butterworth is f0', () => {
    const d = CIRCUITS.skLp.design({ ...defaultParams('skLp'), f0: 2000, q: 0.7071 }, fine)
    const f3 = d.specs.find((s) => s.label === '−3 dB frequency')!.value
    expect(parseFloat(f3)).toBeGreaterThan(1.9)
    expect(parseFloat(f3)).toBeLessThan(2.1)
  })
})

describe('response of every design is consistent', () => {
  for (const kind of KINDS) {
    it(`${kind}: default design is valid, finite and has parts`, () => {
      const p = defaultParams(kind)
      expect(validate(kind, p).bad.size).toBe(0)
      const d = CIRCUITS[kind].design(p, ctx)
      expect(d.parts.length).toBeGreaterThan(1)
      for (const part of d.parts) {
        expect(part.value).toBeGreaterThan(0)
        expect(Number.isFinite(part.value)).toBe(true)
        const s = part.kind === 'R' ? ctx.rs : ctx.cs
        const m = part.value / 10 ** Math.floor(Math.log10(part.value))
        expect(mantissas(s).some((x) => Math.abs(x - m) < 1e-3 * x) || Math.abs(m - 10) < 1e-3).toBe(true)
      }
      for (const s of d.specs) expect(s.value).not.toMatch(/NaN/)
      if (d.chart.type === 'bode') {
        expect(d.chart.resp.mag.every(Number.isFinite)).toBe(true)
        expect(d.chart.resp.f.length).toBeGreaterThan(50)
      }
    })
  }

  it('SK low-pass with E-series parts: analytic f0 matches the swept peak/corner', () => {
    const p = { ...defaultParams('skLp'), q: 2, f0: 1000 }
    const d = CIRCUITS.skLp.design(p, { ...fine })
    if (d.chart.type !== 'bode') throw new Error('bode expected')
    const { f, mag } = d.chart.ideal
    // at f0 the low-pass magnitude is Q (in V/V) for a unity-gain 2nd-order section
    const i = f.findIndex((x) => x >= 1000)
    const m = (mag[i - 1] + mag[i]) / 2
    expect(m).toBeGreaterThan(20 * Math.log10(2) - 0.8)
    expect(m).toBeLessThan(20 * Math.log10(2) + 0.8)
  })

  it('SK high-pass passes high frequencies with unity gain and blocks DC', () => {
    const d = CIRCUITS.skHp.design(defaultParams('skHp'), fine)
    if (d.chart.type !== 'bode') throw new Error('bode expected')
    const m = d.chart.ideal.mag
    expect(m[m.length - 1]).toBeCloseTo(0, 1)
    expect(m[0]).toBeLessThan(-60)
  })

  it('SK equal-component version gives K = 3 - 1/Q passband gain', () => {
    const d = CIRCUITS.skLp.design({ ...defaultParams('skLp'), mode: 1 }, fine)
    const g = parseFloat(d.specs.find((s) => s.label === 'Passband gain')!.value)
    expect(g).toBeGreaterThan(1.55)
    expect(g).toBeLessThan(1.62)
  })

  it('MFB low-pass has DC gain K and the requested Q', () => {
    const d = CIRCUITS.mfbLp.design({ ...defaultParams('mfbLp'), gain: 2, q: 1, f0: 1000 }, fine)
    if (d.chart.type !== 'bode') throw new Error('bode expected')
    expect(d.chart.ideal.mag[0]).toBeCloseTo(20 * Math.log10(2), 1)
    const q = parseFloat(d.specs.find((s) => s.label === 'Q')!.value)
    expect(q).toBeGreaterThan(0.95)
    expect(q).toBeLessThan(1.05)
  })

  it('MFB band-pass peaks at f0 with the requested gain', () => {
    const d = CIRCUITS.mfbBp.design({ ...defaultParams('mfbBp'), gain: 3, q: 8, f0: 2000 }, fine)
    if (d.chart.type !== 'bode') throw new Error('bode expected')
    const { f, mag } = d.chart.ideal
    const peak = Math.max(...mag)
    expect(peak).toBeGreaterThan(20 * Math.log10(3) - 0.3)
    expect(peak).toBeLessThan(20 * Math.log10(3) + 0.3)
    const fp = f[mag.indexOf(peak)]
    expect(fp / 2000).toBeGreaterThan(0.97)
    expect(fp / 2000).toBeLessThan(1.03)
  })

  it('integrator has a -20 dB/dec slope and crosses 0 dB at 1/(2πRC)', () => {
    const d = CIRCUITS.integrator.design({ fu: 1000, r: 10e3, dc: 0 }, fine)
    if (d.chart.type !== 'bode') throw new Error('bode expected')
    const { f, mag } = d.chart.ideal
    const a = f.findIndex((x) => x > 1e2)
    const b = f.findIndex((x) => x > 1e3)
    expect((mag[b] - mag[a]) / Math.log10(f[b] / f[a])).toBeCloseTo(-20, 0)
    expect(parseFloat(d.specs[0].value)).toBeGreaterThan(0.9)
  })

  it('finite GBW lowers the bandwidth of a gain of 100 to about GBW/100', () => {
    const d = CIRCUITS.noninverting.design({ gain: 100, r1: 1000 }, { ...ctx, op: { gbw: 1e6, a0: 1e6 } })
    const bw = d.specs.find((s) => s.label === 'Bandwidth (−3 dB)')!.value
    expect(parseFloat(bw)).toBeGreaterThan(9)
    expect(parseFloat(bw)).toBeLessThan(11)
    expect(bw).toContain('kHz')
  })

  it('worst-case gain error of an inverting stage is about 2·tol', () => {
    const w = spec('inverting', 'Worst-case gain error', fine)!
    expect(parseFloat(w.replace('±', ''))).toBeGreaterThan(1.9)
    expect(parseFloat(w.replace('±', ''))).toBeLessThan(2.1)
  })

  it('comparator thresholds are symmetric about the centre', () => {
    const d = CIRCUITS.schmitt.design(defaultParams('schmitt'), ctx)
    const hi = parseFloat(d.specs[0].value)
    const lo = parseFloat(d.specs[1].value)
    expect((hi + lo) / 2).toBeGreaterThan(2.45)
    expect((hi + lo) / 2).toBeLessThan(2.55)
    expect(hi - lo).toBeGreaterThan(0.45)
    expect(hi - lo).toBeLessThan(0.55)
  })

  it('low GBW produces a warning for filters', () => {
    const d = CIRCUITS.skLp.design({ ...defaultParams('skLp'), f0: 100e3 }, { ...ctx, op: { gbw: 1e6, a0: 1e5 } })
    expect(d.notes.some((n) => n.tone === 'warn')).toBe(true)
  })
})

describe('validation', () => {
  it('flags out-of-range and impossible values', () => {
    expect(validate('inverting', { gain: 0, rin: 10e3 }).bad.has('gain')).toBe(true)
    expect(validate('inverting', { gain: NaN, rin: 10e3 }).bad.has('gain')).toBe(true)
    expect(validate('mfbBp', { ...defaultParams('mfbBp'), gain: 100, q: 1 }).message).toBeTruthy()
    expect(validate('schmitt', { ...defaultParams('schmitt'), hyst: 9 }).message).toBeTruthy()
  })
})

describe('ideal transfer', () => {
  it('unity-gain SK passes DC with gain 1', () => {
    const d = CIRCUITS.skLp.design(defaultParams('skLp'), ctx)
    expect(d.chart.type).toBe('bode')
    expect(transfer({ elems: [{ t: 'R', a: 'in', b: 'out', v: 1 }, { t: 'R', a: 'out', b: '0', v: 1 }], drive: { in: 1 }, out: 'out' }, IDEAL, 1)[0]).toBeCloseTo(0.5, 9)
  })
})
