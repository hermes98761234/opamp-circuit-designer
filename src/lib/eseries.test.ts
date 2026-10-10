import { describe, expect, it } from 'vitest'
import { bestPair, floorTo, mantissas, nearest } from './eseries'

describe('E series', () => {
  it('has the right sizes', () => {
    expect(mantissas('E6')).toHaveLength(6)
    expect(mantissas('E12')).toHaveLength(12)
    expect(mantissas('E24')).toHaveLength(24)
    expect(mantissas('E48')).toHaveLength(48)
    expect(mantissas('E96')).toHaveLength(96)
    expect(mantissas('E192')).toHaveLength(192)
  })
  it('matches IEC 60063 tables', () => {
    expect(mantissas('E6')).toEqual([1.0, 1.5, 2.2, 3.3, 4.7, 6.8])
    expect(mantissas('E12')).toEqual([1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2])
    // E48 and E96 reference values
    expect(mantissas('E48').slice(0, 8)).toEqual([1.0, 1.05, 1.1, 1.15, 1.21, 1.27, 1.33, 1.4])
    expect(mantissas('E96').slice(0, 10)).toEqual([1.0, 1.02, 1.05, 1.07, 1.1, 1.13, 1.15, 1.18, 1.21, 1.24])
    expect(mantissas('E96').slice(-3)).toEqual([9.31, 9.53, 9.76])
    expect(mantissas('E192').slice(0, 6)).toEqual([1.0, 1.01, 1.02, 1.04, 1.05, 1.06])
  })
  it('finds the nearest value in any decade', () => {
    expect(nearest(4800, 'E12')).toBe(4700)
    expect(nearest(10300, 'E96')).toBe(10200)
    expect(nearest(9.7e-9, 'E12')).toBe(10e-9)
    expect(nearest(1.0, 'E6')).toBe(1)
    expect(nearest(0.039, 'E24')).toBe(0.039)
  })
  it('floors to a series value', () => {
    expect(floorTo(4600, 'E12')).toBe(3900)
    expect(floorTo(4700, 'E12')).toBe(4700)
  })
  it('finds a resistor pair with a precise ratio', () => {
    const { a, b, err } = bestPair(10, 'E96', 10000)
    expect(b / a).toBeCloseTo(10, 2)
    expect(Math.abs(err)).toBeLessThan(0.005)
    const c = bestPair(2.5, 'E12', 1000)
    expect(Math.abs(c.err)).toBeLessThan(0.05)
  })
})
