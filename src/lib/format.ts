const PREFIX: Record<string, number> = { T: 1e12, G: 1e9, M: 1e6, meg: 1e6, k: 1e3, K: 1e3, m: 1e-3, u: 1e-6, 'µ': 1e-6, n: 1e-9, p: 1e-12, f: 1e-15 }

/** Parses "4.7k", "100n", "2.2 uF", "1e3", "1MHz", "10 kΩ". Case matters: m = milli, M = mega. */
export function parseSI(text: string): number | undefined {
  const m = /^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s*(meg|[TGMkKmuµnpf])?\s*[a-zA-ZΩ]*\s*$/.exec(text)
  if (!m) return undefined
  const v = Number(m[1]) * (m[2] ? PREFIX[m[2]] : 1)
  return Number.isFinite(v) ? v : undefined
}

const STEPS: [number, string][] = [[1e12, 'T'], [1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p'], [1e-15, 'f']]

/** Engineering notation with an SI prefix: 4700 → "4.7k", 2.2e-8 → "22n". */
export function formatSI(v: number, digits = 3, space = false): string {
  if (v === 0) return '0'
  if (!Number.isFinite(v)) return v > 0 ? '∞' : v < 0 ? '−∞' : '—'
  const a = Math.abs(v)
  let [scale, sym] = STEPS.find(([s]) => a >= s * 0.9995) ?? STEPS[STEPS.length - 1]
  let x = a / scale
  if (+x.toPrecision(digits) >= 1000 && scale < 1e12) {
    const i = STEPS.findIndex(([s]) => s === scale)
    ;[scale, sym] = STEPS[i - 1]
    x = a / scale
  }
  const s = String(+x.toPrecision(digits))
  return (v < 0 ? '−' : '') + s + (space && sym ? ' ' : '') + sym
}

/** Value with unit and a space before the prefix: 4700 Ω → "4.7 kΩ". */
export const fmtU = (v: number, unit: string, digits = 3): string => {
  const s = formatSI(v, digits, true)
  return s + (/[a-zA-Zµ]$/.test(s) ? '' : ' ') + unit
}

export const fmtNum = (v: number, digits = 3): string => (Number.isFinite(v) ? String(+v.toPrecision(digits)).replace('-', '−') : '—')
export const fmtPct = (v: number, digits = 2): string => (v > 0 ? '+' : '') + fmtNum(v, digits) + ' %'
export const fmtDb = (v: number): string => fmtNum(v, 3) + ' dB'
export const fmtHz = (v: number): string => fmtU(v, 'Hz')
