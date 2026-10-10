import type { Lang } from '../i18n'
import { SERIES, type Series } from './eseries'
import { defaultParams, KINDS, type Ctx, type Kind, type Params } from './circuits'

export type Theme = 'auto' | 'light' | 'dark'

export type OpAmpPreset = { id: string; name: string; gbw: number; a0: number }

/** Typical datasheet values (rounded). */
export const OPAMPS: OpAmpPreset[] = [
  { id: 'lm358', name: 'LM358', gbw: 1.1e6, a0: 1e5 },
  { id: 'lm324', name: 'LM324', gbw: 1.2e6, a0: 1e5 },
  { id: 'mcp6002', name: 'MCP6002', gbw: 1e6, a0: 3.5e5 },
  { id: 'tl072', name: 'TL072', gbw: 3e6, a0: 2e5 },
  { id: 'lf411', name: 'LF411', gbw: 4e6, a0: 2e5 },
  { id: 'opa2134', name: 'OPA2134', gbw: 8e6, a0: 1e6 },
  { id: 'ne5532', name: 'NE5532', gbw: 10e6, a0: 1e5 },
  { id: 'tlv9062', name: 'TLV9062', gbw: 10e6, a0: 3e5 },
  { id: 'opa1612', name: 'OPA1612', gbw: 40e6, a0: 3e6 },
  { id: 'opa828', name: 'OPA828', gbw: 45e6, a0: 1.8e6 },
  { id: 'custom', name: 'Custom', gbw: 1e6, a0: 1e5 },
]

export type Settings = {
  lang: Lang
  theme: Theme
  rSeries: Series
  cSeries: Series
  /** Resistor tolerance, percent. */
  tolPct: number
  opamp: string
  gbw: number
  a0: number
}

export type AppState = {
  kind: Kind
  params: Record<Kind, Params>
  settings: Settings
}

export const KEY = 'opamp-circuit-designer:v1'

export function defaultState(): AppState {
  const op = OPAMPS.find((o) => o.id === 'tl072')!
  return {
    kind: 'skLp',
    params: Object.fromEntries(KINDS.map((k) => [k, defaultParams(k)])) as Record<Kind, Params>,
    settings: {
      lang: typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('uk') ? 'uk' : 'en',
      theme: 'auto',
      rSeries: 'E96',
      cSeries: 'E12',
      tolPct: 1,
      opamp: op.id,
      gbw: op.gbw,
      a0: op.a0,
    },
  }
}

const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)

export function loadState(storage: Pick<Storage, 'getItem'> | undefined = typeof localStorage === 'undefined' ? undefined : localStorage): AppState {
  const base = defaultState()
  try {
    const raw = storage?.getItem(KEY)
    if (!raw) return base
    const s = JSON.parse(raw) as Partial<AppState>
    const st = s.settings
    if (s.kind && (KINDS as readonly string[]).includes(s.kind)) base.kind = s.kind
    for (const k of KINDS) {
      const saved = s.params?.[k]
      if (saved) for (const key of Object.keys(base.params[k])) base.params[k][key] = num(saved[key], base.params[k][key])
    }
    if (st) {
      const b = base.settings
      if (st.lang === 'en' || st.lang === 'uk') b.lang = st.lang
      if (st.theme === 'auto' || st.theme === 'light' || st.theme === 'dark') b.theme = st.theme
      if (SERIES.includes(st.rSeries as Series)) b.rSeries = st.rSeries
      if (SERIES.includes(st.cSeries as Series)) b.cSeries = st.cSeries
      b.tolPct = Math.min(Math.max(num(st.tolPct, b.tolPct), 0.01), 20)
      if (OPAMPS.some((o) => o.id === st.opamp)) b.opamp = st.opamp as string
      b.gbw = Math.min(Math.max(num(st.gbw, b.gbw), 1e3), 1e11)
      b.a0 = Math.min(Math.max(num(st.a0, b.a0), 10), 1e9)
    }
  } catch {
    /* corrupt storage: start fresh */
  }
  return base
}

export function saveState(s: AppState, storage: Pick<Storage, 'setItem'> | undefined = typeof localStorage === 'undefined' ? undefined : localStorage) {
  try {
    storage?.setItem(KEY, JSON.stringify(s))
  } catch {
    /* storage full or blocked */
  }
}

export const ctxOf = (s: Settings): Ctx => ({ rs: s.rSeries, cs: s.cSeries, tol: s.tolPct / 100, op: { gbw: s.gbw, a0: s.a0 } })
