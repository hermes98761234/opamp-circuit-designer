import type { Chart } from '../lib/circuits'
import { fmtNum } from '../lib/format'
import type { T } from '../i18n'

type Hyst = Extract<Chart, { type: 'hyst' }>
const W = 520
const H = 280
const P = { l: 54, r: 20, t: 20, b: 36 }

export default function HystChart({ chart, t }: { chart: Hyst; t: T }) {
  const { vth, vtl, vhi, vlo } = chart
  const span = vhi - vlo
  const pad = Math.max(vth - vtl, span * 0.15)
  const x0 = Math.min(vtl, vlo) - pad
  const x1 = Math.max(vth, vhi) + pad
  const y0 = vlo - span * 0.15
  const y1 = vhi + span * 0.15
  const x = (v: number) => P.l + ((v - x0) / (x1 - x0)) * (W - P.l - P.r)
  const y = (v: number) => P.t + (1 - (v - y0) / (y1 - y0)) * (H - P.t - P.b)
  const arrow = (px: number, py: number, dir: 1 | -1 | 2 | -2) => {
    const s = 6
    const pts = Math.abs(dir) === 1 ? `${px},${py} ${px - dir * s},${py - s / 1.5} ${px - dir * s},${py + s / 1.5}` : `${px},${py} ${px - s / 1.5},${py - (dir / 2) * s} ${px + s / 1.5},${py - (dir / 2) * s}`
    return <polygon points={pts} className="hy-arrow" />
  }
  const mid = (a: number, b: number) => (a + b) / 2
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('Transfer curve with hysteresis')}>
        <line x1={P.l} x2={W - P.r} y1={y(vlo)} y2={y(vlo)} className="ch-grid" />
        <line x1={P.l} x2={W - P.r} y1={y(vhi)} y2={y(vhi)} className="ch-grid" />
        <line x1={x(vth)} x2={x(vth)} y1={P.t} y2={H - P.b} className="ch-grid" />
        <line x1={x(vtl)} x2={x(vtl)} y1={P.t} y2={H - P.b} className="ch-grid" />
        {/* input rising: output high until VTH, then low; falling: low until VTL, then high */}
        <polyline points={`${P.l},${y(vhi)} ${x(vth)},${y(vhi)} ${x(vth)},${y(vlo)} ${W - P.r},${y(vlo)}`} className="ch-line" />
        <polyline points={`${W - P.r},${y(vlo)} ${x(vtl)},${y(vlo)} ${x(vtl)},${y(vhi)} ${P.l},${y(vhi)}`} className="ch-ideal" />
        {arrow(mid(x(vtl), x(vth)) + 6, y(vhi), 1)}
        {arrow(mid(x(vtl), x(vth)) - 6, y(vlo), -1)}
        {arrow(x(vth), mid(y(vhi), y(vlo)), 2)}
        {arrow(x(vtl), mid(y(vhi), y(vlo)), -2)}
        <text x={x(vth)} y={H - 20} textAnchor="middle" className="ch-text">
          VTH {fmtNum(vth, 4)}
        </text>
        <text x={x(vtl)} y={H - 20} textAnchor="middle" className="ch-text">
          VTL {fmtNum(vtl, 4)}
        </text>
        <text x={P.l - 6} y={y(vhi) + 4} textAnchor="end" className="ch-text">
          {fmtNum(vhi, 3)}
        </text>
        <text x={P.l - 6} y={y(vlo) + 4} textAnchor="end" className="ch-text">
          {fmtNum(vlo, 3)}
        </text>
        <text x={W - P.r} y={H - 4} textAnchor="end" className="ch-text">
          {t('Input voltage (V)')}
        </text>
        <text x={12} y={(H - P.b) / 2} transform={`rotate(-90 12 ${(H - P.b) / 2})`} textAnchor="middle" className="ch-text">
          {t('Output voltage (V)')}
        </text>
      </svg>
      <div className="legend">
        <span className="lg lg-line">{t('Input rising')}</span>
        <span className="lg lg-ideal">{t('Input falling')}</span>
      </div>
    </div>
  )
}
