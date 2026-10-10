import { useState } from 'react'
import type { Chart } from '../lib/circuits'
import { fmtHz, fmtNum, formatSI } from '../lib/format'
import type { Response } from '../lib/mna'
import type { T } from '../i18n'

const W = 760
const PAD = { l: 52, r: 14, t: 10, b: 24 }
const PAD2_B = 40
const H1 = 230
const H2 = 150

function niceStep(range: number, target: number) {
  const raw = range / target
  const p = 10 ** Math.floor(Math.log10(raw))
  const m = raw / p
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p
}

type Bode = Extract<Chart, { type: 'bode' }>

export default function BodeChart({ chart, t }: { chart: Bode; t: T }) {
  const { resp, ideal, marks } = chart
  const [hover, setHover] = useState<number | null>(null)
  const f = resp.f
  const lx0 = Math.log10(f[0])
  const lx1 = Math.log10(f[f.length - 1])
  const x = (hz: number) => PAD.l + ((Math.log10(hz) - lx0) / (lx1 - lx0)) * (W - PAD.l - PAD.r)

  const mags = [...resp.mag, ...ideal.mag].filter(Number.isFinite)
  const hi = Math.max(...mags)
  const lo = Math.max(Math.min(...mags), hi - 120)
  const step = niceStep(hi - lo || 10, 5)
  const m0 = Math.floor((lo - 1) / step) * step
  const m1 = Math.ceil((hi + 1) / step) * step
  const ym = (v: number) => PAD.t + (1 - (Math.min(Math.max(v, m0), m1) - m0) / (m1 - m0)) * (H1 - PAD.t - PAD.b)

  const phs = [...resp.phase, ...ideal.phase]
  const pstep = niceStep(Math.max(...phs) - Math.min(...phs) || 90, 4)
  const p0 = Math.floor(Math.min(...phs) / pstep) * pstep
  const p1 = Math.max(Math.ceil(Math.max(...phs) / pstep) * pstep, p0 + pstep)
  const yp = (v: number) => PAD.t + (1 - (v - p0) / (p1 - p0)) * (H2 - PAD.t - PAD2_B)

  const path = (r: Response, key: 'mag' | 'phase', fy: (v: number) => number) => r.f.map((hz, i) => `${i ? 'L' : 'M'}${x(hz).toFixed(1)},${fy(r[key][i]).toFixed(1)}`).join(' ')

  const decades: number[] = []
  for (let e = Math.ceil(lx0); e <= Math.floor(lx1); e++) decades.push(10 ** e)
  const mTicks: number[] = []
  for (let v = m0; v <= m1 + 1e-9; v += step) mTicks.push(v)
  const pTicks: number[] = []
  for (let v = p0; v <= p1 + 1e-9; v += pstep) pTicks.push(v)

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * W
    const lf = lx0 + ((px - PAD.l) / (W - PAD.l - PAD.r)) * (lx1 - lx0)
    if (lf < lx0 || lf > lx1) return setHover(null)
    let best = 0
    f.forEach((hz, i) => {
      if (Math.abs(Math.log10(hz) - lf) < Math.abs(Math.log10(f[best]) - lf)) best = i
    })
    setHover(best)
  }

  const gridX = (h: number) =>
    decades.map((d) => (
      <g key={d}>
        <line x1={x(d)} x2={x(d)} y1={PAD.t} y2={h - (h === H2 ? PAD2_B : PAD.b)} className="ch-grid" />
        {h === H2 ? (
          <text x={x(d)} y={h - PAD2_B + 14} textAnchor="middle" className="ch-text">
            {formatSI(d)}
          </text>
        ) : null}
      </g>
    ))

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H1}`} onPointerMove={onMove} onPointerLeave={() => setHover(null)} role="img" aria-label={t('Gain versus frequency')}>
        {gridX(H1)}
        {mTicks.map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={ym(v)} y2={ym(v)} className={Math.abs(v) < 1e-9 ? 'ch-grid ch-strong' : 'ch-grid'} />
            <text x={PAD.l - 6} y={ym(v) + 4} textAnchor="end" className="ch-text">
              {fmtNum(v, 3)}
            </text>
          </g>
        ))}
        <text x={12} y={(H1 - PAD.b) / 2} transform={`rotate(-90 12 ${(H1 - PAD.b) / 2})`} textAnchor="middle" className="ch-text">
          {t('Gain (dB)')}
        </text>
        <path d={path(ideal, 'mag', ym)} className="ch-ideal" />
        <path d={path(resp, 'mag', ym)} className="ch-line" />
        {marks.map((mk) => (
          <g key={mk.label}>
            <line x1={x(mk.f)} x2={x(mk.f)} y1={PAD.t} y2={H1 - PAD.b} className="ch-mark" />
            <text x={x(mk.f) + 4} y={PAD.t + 10} className="ch-text ch-mark-text">
              {mk.label} {fmtHz(mk.f)}
            </text>
          </g>
        ))}
        {hover !== null ? <line x1={x(f[hover])} x2={x(f[hover])} y1={PAD.t} y2={H1 - PAD.b} className="ch-cursor" /> : null}
      </svg>
      <svg viewBox={`0 0 ${W} ${H2}`} onPointerMove={onMove} onPointerLeave={() => setHover(null)} role="img" aria-label={t('Phase versus frequency')}>
        {gridX(H2)}
        {pTicks.map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={yp(v)} y2={yp(v)} className="ch-grid" />
            <text x={PAD.l - 6} y={yp(v) + 4} textAnchor="end" className="ch-text">
              {fmtNum(v, 3)}
            </text>
          </g>
        ))}
        <text x={12} y={(H2 - PAD2_B) / 2} transform={`rotate(-90 12 ${(H2 - PAD2_B) / 2})`} textAnchor="middle" className="ch-text">
          {t('Phase (°)')}
        </text>
        <path d={path(ideal, 'phase', yp)} className="ch-ideal" />
        <path d={path(resp, 'phase', yp)} className="ch-line" />
        {hover !== null ? <line x1={x(f[hover])} x2={x(f[hover])} y1={PAD.t} y2={H2 - PAD2_B} className="ch-cursor" /> : null}
        <text x={(W + PAD.l) / 2} y={H2 - 6} textAnchor="middle" className="ch-text">
          {t('Frequency (Hz)')}
        </text>
      </svg>
      <div className="legend">
        <span className="lg lg-line">{t('With the chosen op-amp')}</span>
        <span className="lg lg-ideal">{t('Ideal op-amp')}</span>
        <span className="readout">
          {hover !== null
            ? `${formatSI(f[hover])}Hz · ${fmtNum(resp.mag[hover], 4)} dB · ${fmtNum(resp.phase[hover], 4)}°`
            : t('Move the pointer over the plot to read values.')}
        </span>
      </div>
    </div>
  )
}
