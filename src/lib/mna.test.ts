import { describe, expect, it } from 'vitest'
import { crossDown, IDEAL, logspace, sweep, transfer, type Circuit } from './mna'

const mag = (z: [number, number]) => Math.hypot(z[0], z[1])

describe('MNA solver', () => {
  it('solves an RC low-pass: |H| = 1/sqrt(1+(f/fc)^2)', () => {
    const R = 1000
    const C = 159.15494e-9 // fc = 1 kHz
    const c: Circuit = { elems: [{ t: 'R', a: 'in', b: 'out', v: R }, { t: 'C', a: 'out', b: '0', v: C }], drive: { in: 1 }, out: 'out' }
    expect(mag(transfer(c, IDEAL, 1000))).toBeCloseTo(Math.SQRT1_2, 5)
    const z = transfer(c, IDEAL, 1000)
    expect((Math.atan2(z[1], z[0]) * 180) / Math.PI).toBeCloseTo(-45, 3)
    expect(mag(transfer(c, IDEAL, 10))).toBeCloseTo(1 / Math.sqrt(1 + 0.01 ** 2), 6)
  })

  const inverting = (rf: number, r1: number): Circuit => ({
    elems: [{ t: 'R', a: 'in', b: 'n', v: r1 }, { t: 'R', a: 'n', b: 'out', v: rf }, { t: 'OA', p: '0', n: 'n', o: 'out' }],
    drive: { in: 1 },
    out: 'out',
  })

  it('gives -Rf/R1 for an ideal inverting amplifier', () => {
    const z = transfer(inverting(10000, 1000), IDEAL, 100)
    expect(z[0]).toBeCloseTo(-10, 4)
    expect(Math.abs(z[1])).toBeLessThan(1e-3)
  })

  it('rolls off at GBW / noise gain for a finite-GBW op-amp', () => {
    // noise gain 11, GBW 1 MHz: -3 dB near 90.9 kHz
    const f = logspace(1e3, 1e7, 40)
    const r = sweep(inverting(10000, 1000), { gbw: 1e6, a0: 1e6 }, f)
    const fc = crossDown(f, r.mag, r.mag[0] - 3)!
    expect(fc / 1e6 / (1 / 11)).toBeGreaterThan(0.95)
    expect(fc / 1e6 / (1 / 11)).toBeLessThan(1.05)
  })

  it('limits the DC gain by the open-loop gain', () => {
    const z = transfer(inverting(10000, 1000), { gbw: 1e6, a0: 100 }, 1e-3)
    // closed loop = -10 * T/(1+T), T = A/(1+Rf/R1)
    const T = 100 / 11
    expect(z[0]).toBeCloseTo((-10 * T) / (1 + T), 3)
  })

  it('unwraps phase', () => {
    const f = logspace(10, 1e5, 20)
    const r = sweep(inverting(10000, 1000), { gbw: 1e6, a0: 1e5 }, f)
    for (let i = 1; i < r.phase.length; i++) expect(Math.abs(r.phase[i] - r.phase[i - 1])).toBeLessThan(90)
  })
})
