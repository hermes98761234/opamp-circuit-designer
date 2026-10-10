import { describe, expect, it } from 'vitest'
import { formatSI, parseSI } from './format'

describe('parseSI', () => {
  it('parses prefixes and units', () => {
    expect(parseSI('4.7k')).toBeCloseTo(4700)
    expect(parseSI('100n')).toBeCloseTo(1e-7, 18)
    expect(parseSI('2.2 uF')).toBeCloseTo(2.2e-6, 18)
    expect(parseSI('10 kΩ')).toBe(10000)
    expect(parseSI('1MHz')).toBe(1e6)
    expect(parseSI('5mV')).toBeCloseTo(0.005)
    expect(parseSI('1e3')).toBe(1000)
    expect(parseSI('.5')).toBe(0.5)
    expect(parseSI('3 Meg')).toBe(3e6)
  })
  it('rejects garbage', () => {
    expect(parseSI('')).toBeUndefined()
    expect(parseSI('abc')).toBeUndefined()
    expect(parseSI('1.2.3')).toBeUndefined()
  })
})

describe('formatSI', () => {
  it('uses engineering prefixes', () => {
    expect(formatSI(4700)).toBe('4.7k')
    expect(formatSI(2.2e-8)).toBe('22n')
    expect(formatSI(1)).toBe('1')
    expect(formatSI(0.0033)).toBe('3.3m')
    expect(formatSI(1e6)).toBe('1M')
    expect(formatSI(999999)).toBe('1M')
    expect(formatSI(-1500)).toBe('−1.5k')
  })
})
