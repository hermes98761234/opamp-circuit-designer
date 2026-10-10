import { useEffect, useMemo, useState } from 'react'
import { CIRCUITS, defaultParams, validate, type Design, type Kind, type ParamDef } from './lib/circuits'
import { SERIES, type Series } from './lib/eseries'
import { fmtNum, formatSI } from './lib/format'
import { OPAMPS, ctxOf, loadState, saveState, type AppState, type Settings } from './lib/model'
import { N, tr, type Lang, type T } from './i18n'
import BodeChart from './components/BodeChart'
import HystChart from './components/HystChart'
import Schematic from './components/Schematic'
import SIField from './components/SIField'

const GROUPS: { title: string; kinds: Kind[] }[] = [
  { title: N('Amplifiers'), kinds: ['inverting', 'noninverting', 'differential', 'instrumentation', 'summing', 'integrator'] },
  { title: N('Active filters'), kinds: ['skLp', 'skHp', 'mfbLp', 'mfbBp'] },
  { title: N('Comparator'), kinds: ['schmitt'] },
]

export default function App() {
  const [state, setState] = useState<AppState>(loadState)
  const { kind, settings } = state
  const t: T = (s, ...a) => tr(settings.lang, s, ...a)
  const def = CIRCUITS[kind]
  const params = state.params[kind]
  const check = useMemo(() => validate(kind, params), [kind, params])
  const ctx = useMemo(() => ctxOf(settings), [settings])

  const design = useMemo<Design | null>(() => {
    if (check.bad.size > 0) return null
    try {
      return def.design(params, ctx)
    } catch {
      return null
    }
  }, [check, def, params, ctx])

  useEffect(() => saveState(state), [state])
  useEffect(() => {
    const root = document.documentElement
    if (settings.theme === 'auto') delete root.dataset.theme
    else root.dataset.theme = settings.theme
    root.lang = settings.lang
    document.title = t('Op-amp circuit designer') + ': ' + t(def.title)
  })

  const setSettings = (patch: Partial<Settings>) => setState((s) => ({ ...s, settings: { ...s.settings, ...patch } }))
  const setParam = (key: string, v: number) => setState((s) => ({ ...s, params: { ...s.params, [kind]: { ...s.params[kind], [key]: v } } }))
  const resetParams = () => setState((s) => ({ ...s, params: { ...s.params, [kind]: defaultParams(kind) } }))

  const gbwBad = !(settings.gbw >= 1e3 && settings.gbw <= 1e11)
  const a0Bad = !(settings.a0 >= 10 && settings.a0 <= 1e9)
  const tolBad = !(settings.tolPct >= 0.01 && settings.tolPct <= 20)

  const field = (d: ParamDef) => {
    if (d.options) {
      return (
        <label className="field" key={d.key}>
          <span>{t(d.label)}</span>
          <select value={params[d.key]} onChange={(e) => setParam(d.key, Number(e.target.value))}>
            {d.options.map((o) => (
              <option key={o.v} value={o.v}>
                {t(o.label)}
              </option>
            ))}
          </select>
        </label>
      )
    }
    return (
      <div key={d.key}>
        <SIField label={t(d.label)} unit={d.unit} value={params[d.key]} bad={check.bad.has(d.key)} hint={d.hint ? t(d.hint) : undefined} onChange={(v) => setParam(d.key, v)} />
        {d.presets ? (
          <div className="chips">
            {d.presets.map((pr) => (
              <button key={pr.label} className="small" onClick={() => setParam(d.key, pr.v)}>
                {t(pr.label)} ({pr.v})
              </button>
            ))}
          </div>
        ) : null}
      </div>
    )
  }

  const partsText = design ? design.parts.map((p) => `${p.ref}\t${formatSI(p.value)}${p.kind === 'R' ? ' Ω' : ' F'}`).join('\n') : ''

  return (
    <div className="app">
      <header className="toolbar">
        <span className="brand">{t('Op-amp circuit designer')}</span>
        <span className="hint">{t('Pick a circuit, set the target, get standard parts, a schematic and the frequency response.')}</span>
        <span className="spacer" />
        <label className="inline">
          {t('Language')}
          <select value={settings.lang} onChange={(e) => setSettings({ lang: e.target.value as Lang })}>
            <option value="en">English</option>
            <option value="uk">Українська</option>
          </select>
        </label>
        <label className="inline">
          {t('Theme')}
          <select value={settings.theme} onChange={(e) => setSettings({ theme: e.target.value as Settings['theme'] })}>
            <option value="auto">{t('System')}</option>
            <option value="light">{t('Light')}</option>
            <option value="dark">{t('Dark')}</option>
          </select>
        </label>
      </header>
      <div className="body">
        <aside className="side">
          <div className="panel">
            <div className="section">
              <h3>{t('Circuit')}</h3>
              <label className="field">
                <select value={kind} aria-label={t('Circuit')} onChange={(e) => setState((s) => ({ ...s, kind: e.target.value as Kind }))}>
                  {GROUPS.map((g) => (
                    <optgroup key={g.title} label={t(g.title)}>
                      {g.kinds.map((k) => (
                        <option key={k} value={k}>
                          {t(CIRCUITS[k].title)}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
              <p className="hint">{t(def.blurb)}</p>
            </div>
            <div className="section">
              <h3>{t('Target')}</h3>
              {def.params.map(field)}
              {check.message ? <p className="hint err-text">{t(check.message)}</p> : null}
              {check.bad.size > 0 && !check.message ? <p className="hint err-text">{t('Fix the highlighted fields.')}</p> : null}
              <div className="row">
                <button className="small" onClick={resetParams}>
                  {t('Reset to defaults')}
                </button>
              </div>
              <p className="hint">{t('Values accept SI suffixes: 4.7k, 100n, 1M.')}</p>
            </div>
            <div className="section">
              <h3>{t('Op-amp')}</h3>
              <label className="field">
                <span>{t('Model (typical datasheet values)')}</span>
                <select
                  value={settings.opamp}
                  onChange={(e) => {
                    const o = OPAMPS.find((x) => x.id === e.target.value)!
                    setSettings(o.id === 'custom' ? { opamp: o.id } : { opamp: o.id, gbw: o.gbw, a0: o.a0 })
                  }}
                >
                  {OPAMPS.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.id === 'custom' ? t('Custom') : o.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid2">
                <SIField label={t('Gain-bandwidth')} unit="Hz" value={settings.gbw} bad={gbwBad} onChange={(v) => setSettings({ gbw: v, opamp: 'custom' })} />
                <SIField label={t('Open-loop gain')} unit="V/V" value={settings.a0} bad={a0Bad} onChange={(v) => setSettings({ a0: v, opamp: 'custom' })} />
              </div>
            </div>
            <div className="section">
              <h3>{t('Parts')}</h3>
              <div className="grid3">
                <label className="field">
                  <span>{t('Resistors')}</span>
                  <select value={settings.rSeries} onChange={(e) => setSettings({ rSeries: e.target.value as Series })}>
                    {SERIES.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>{t('Capacitors')}</span>
                  <select value={settings.cSeries} onChange={(e) => setSettings({ cSeries: e.target.value as Series })}>
                    {SERIES.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <SIField label={t('Tolerance')} unit="%" value={settings.tolPct} bad={tolBad} onChange={(v) => setSettings({ tolPct: v })} />
              </div>
            </div>
          </div>
        </aside>
        <main className="main">
          {design ? (
            <>
              <div className="cols">
                <section className="box">
                  <h3>{t(def.title)}</h3>
                  <Schematic kind={kind} parts={design.parts} flags={design.flags} label={t('Schematic of the {0}', t(def.title))} />
                </section>
                <section className="box">
                  <h3>{t('Results')}</h3>
                  <table className="data">
                    <tbody>
                      {design.specs.map((s) => (
                        <tr key={s.label}>
                          <td>{t(s.label)}</td>
                          <td className={s.tone ? s.tone + '-text' : undefined}>{s.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <ul className="notes">
                    {design.notes.map((n) => (
                      <li key={n.text} className={n.tone === 'warn' ? 'warn-text' : 'hint'}>
                        {t(n.text, ...n.args)}
                      </li>
                    ))}
                  </ul>
                </section>
              </div>
              <section className="box">
                <h3>{design.chart.type === 'bode' ? t('Frequency response') : t('Transfer curve')}</h3>
                {design.chart.type === 'bode' ? <BodeChart chart={design.chart} t={t} /> : <HystChart chart={design.chart} t={t} />}
              </section>
              <section className="box">
                <div className="row">
                  <h3 className="grow">{t('Parts list')}</h3>
                  <button className="small" onClick={() => navigator.clipboard?.writeText(partsText)}>
                    {t('Copy')}
                  </button>
                </div>
                <table className="data">
                  <thead>
                    <tr>
                      <td>{t('Part')}</td>
                      <td>{t('Calculated')}</td>
                      <td>{t('Standard value')}</td>
                      <td>{t('Difference')}</td>
                    </tr>
                  </thead>
                  <tbody>
                    {design.parts.map((p) => {
                      const e = (p.value / p.ideal - 1) * 100
                      return (
                        <tr key={p.ref}>
                          <td>{p.ref}</td>
                          <td>{formatSI(p.ideal, 4) + (p.kind === 'R' ? ' Ω' : ' F')}</td>
                          <td>
                            <b>{formatSI(p.value) + (p.kind === 'R' ? ' Ω' : ' F')}</b>
                          </td>
                          <td>{Math.abs(e) < 0.005 ? '0 %' : (e > 0 ? '+' : '') + fmtNum(e, 2) + ' %'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </section>
            </>
          ) : (
            <section className="box">
              <p className="verdict err">{t('Fix the highlighted fields.')}</p>
            </section>
          )}
        </main>
      </div>
      <p className="hint foot">
        {t('Linear small-signal model with a single-pole op-amp; real parts add noise, slew and output limits.')}{' '}
        <a href="https://github.com/hermes98761234/opamp-circuit-designer">{t('Source on GitHub')}</a>
      </p>
    </div>
  )
}
