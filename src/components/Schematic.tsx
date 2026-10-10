import type { ReactNode } from 'react'
import type { Kind, Part, Design } from '../lib/circuits'
import { formatSI } from '../lib/format'

type Pt = [number, number]
type Side = 'above' | 'below' | 'right' | 'left'

const Wire = ({ pts }: { pts: Pt[] }) => <polyline points={pts.map((p) => p.join(',')).join(' ')} className="sc-wire" />
const Dot = ({ at }: { at: Pt }) => <circle cx={at[0]} cy={at[1]} r={3} className="sc-dot" />
const Txt = ({ at, children, anchor = 'start', bold }: { at: Pt; children: ReactNode; anchor?: 'start' | 'middle' | 'end'; bold?: boolean }) => (
  <text x={at[0]} y={at[1]} textAnchor={anchor} className={bold ? 'sc-text sc-bold' : 'sc-text'}>
    {children}
  </text>
)

type Lookup = (ref: string) => { ref: string; val: string }

/** Label placed beside a 60 px component whose first terminal is at `at`. */
function Label({ at, vertical, side, info, gap = 12 }: { at: Pt; vertical: boolean; side: Side; info: { ref: string; val: string }; gap?: number }) {
  const text = `${info.ref} ${info.val}`
  if (vertical) {
    const left = side === 'left'
    return <Txt at={[at[0] + (left ? -gap : gap), at[1] + 34]} anchor={left ? 'end' : 'start'}>{text}</Txt>
  }
  const below = side === 'below'
  return <Txt at={[at[0] + 30, at[1] + (below ? gap + 14 : -gap + 1)]} anchor="middle">{text}</Txt>
}

/** Resistor with terminals at `at` and 60 px along x (horizontal) or y (vertical). */
function Res({ at, v, side, info }: { at: Pt; v?: boolean; side?: Side; info: { ref: string; val: string } }) {
  const [x, y] = at
  return (
    <g>
      {v ? (
        <>
          <polyline points={`${x},${y} ${x},${y + 15}`} className="sc-wire" />
          <rect x={x - 6} y={y + 15} width={12} height={30} className="sc-body" />
          <polyline points={`${x},${y + 45} ${x},${y + 60}`} className="sc-wire" />
        </>
      ) : (
        <>
          <polyline points={`${x},${y} ${x + 15},${y}`} className="sc-wire" />
          <rect x={x + 15} y={y - 6} width={30} height={12} className="sc-body" />
          <polyline points={`${x + 45},${y} ${x + 60},${y}`} className="sc-wire" />
        </>
      )}
      <Label at={at} vertical={!!v} side={side ?? (v ? 'right' : 'above')} info={info} />
    </g>
  )
}

function Cap({ at, v, side, info }: { at: Pt; v?: boolean; side?: Side; info: { ref: string; val: string } }) {
  const [x, y] = at
  return (
    <g>
      {v ? (
        <>
          <polyline points={`${x},${y} ${x},${y + 26}`} className="sc-wire" />
          <polyline points={`${x - 11},${y + 26} ${x + 11},${y + 26}`} className="sc-plate" />
          <polyline points={`${x - 11},${y + 34} ${x + 11},${y + 34}`} className="sc-plate" />
          <polyline points={`${x},${y + 34} ${x},${y + 60}`} className="sc-wire" />
        </>
      ) : (
        <>
          <polyline points={`${x},${y} ${x + 26},${y}`} className="sc-wire" />
          <polyline points={`${x + 26},${y - 11} ${x + 26},${y + 11}`} className="sc-plate" />
          <polyline points={`${x + 34},${y - 11} ${x + 34},${y + 11}`} className="sc-plate" />
          <polyline points={`${x + 34},${y} ${x + 60},${y}`} className="sc-wire" />
        </>
      )}
      <Label at={at} vertical={!!v} side={side ?? (v ? 'right' : 'above')} info={info} gap={18} />
    </g>
  )
}

const Gnd = ({ at: [x, y] }: { at: Pt }) => (
  <g>
    <polyline points={`${x},${y} ${x},${y + 8}`} className="sc-wire" />
    <polyline points={`${x - 10},${y + 8} ${x + 10},${y + 8}`} className="sc-wire" />
    <polyline points={`${x - 6},${y + 12} ${x + 6},${y + 12}`} className="sc-wire" />
    <polyline points={`${x - 2},${y + 16} ${x + 2},${y + 16}`} className="sc-wire" />
  </g>
)

/** Op-amp triangle with inputs at (x, y±15) and the output at (x+60, y). */
function Amp({ at: [x, y], plusTop }: { at: Pt; plusTop: boolean }) {
  return (
    <g>
      <polygon points={`${x},${y - 30} ${x},${y + 30} ${x + 60},${y}`} className="sc-amp" />
      <Txt at={[x + 5, y - 11]}>{plusTop ? '+' : '−'}</Txt>
      <Txt at={[x + 5, y + 20]}>{plusTop ? '−' : '+'}</Txt>
    </g>
  )
}

const Port = ({ at, name, right }: { at: Pt; name: string; right?: boolean }) => (
  <Txt at={[at[0] + (right ? 6 : -6), at[1] + 4]} anchor={right ? 'start' : 'end'} bold>
    {name}
  </Txt>
)

function Inverting({ i }: { i: Lookup }) {
  return (
    <g>
      <Port at={[24, 85]} name="Vin" />
      <Wire pts={[[30, 85], [60, 85]]} />
      <Res at={[60, 85]} info={i('R1')} />
      <Wire pts={[[120, 85], [180, 85]]} />
      <Dot at={[140, 85]} />
      <Wire pts={[[140, 85], [140, 40], [150, 40]]} />
      <Res at={[150, 40]} info={i('Rf')} />
      <Wire pts={[[210, 40], [260, 40], [260, 100]]} />
      <Amp at={[180, 100]} plusTop={false} />
      <Wire pts={[[180, 115], [160, 115], [160, 130]]} />
      <Gnd at={[160, 130]} />
      <Wire pts={[[240, 100], [330, 100]]} />
      <Dot at={[260, 100]} />
      <Port at={[330, 100]} name="Vout" right />
    </g>
  )
}

function Integrator({ i, rf }: { i: Lookup; rf: boolean }) {
  return (
    <g>
      <Port at={[24, 95]} name="Vin" />
      <Wire pts={[[30, 95], [60, 95]]} />
      <Res at={[60, 95]} info={i('R1')} />
      <Wire pts={[[120, 95], [180, 95]]} />
      <Dot at={[140, 95]} />
      <Wire pts={[[140, 95], [140, 25], [150, 25]]} />
      <Cap at={[150, 25]} info={i('C1')} />
      {rf ? (
        <>
          <Dot at={[140, 70]} />
          <Wire pts={[[140, 70], [150, 70]]} />
          <Res at={[150, 70]} info={i('Rf')} />
          <Wire pts={[[210, 70], [260, 70]]} />
          <Dot at={[260, 70]} />
        </>
      ) : null}
      <Wire pts={[[210, 25], [260, 25], [260, 110]]} />
      <Amp at={[180, 110]} plusTop={false} />
      <Wire pts={[[180, 125], [160, 125], [160, 140]]} />
      <Gnd at={[160, 140]} />
      <Wire pts={[[240, 110], [330, 110]]} />
      <Dot at={[260, 110]} />
      <Port at={[330, 110]} name="Vout" right />
    </g>
  )
}

function NonInverting({ i }: { i: Lookup }) {
  return (
    <g>
      <Port at={[24, 85]} name="Vin" />
      <Wire pts={[[30, 85], [200, 85]]} />
      <Amp at={[200, 100]} plusTop />
      <Wire pts={[[200, 115], [150, 115], [150, 160]]} />
      <Dot at={[150, 160]} />
      <Wire pts={[[150, 160], [170, 160]]} />
      <Res at={[170, 160]} info={i('Rf')} side="below" />
      <Wire pts={[[230, 160], [290, 160], [290, 100]]} />
      <Res at={[150, 160]} v info={i('R1')} side="left" />
      <Gnd at={[150, 220]} />
      <Wire pts={[[260, 100], [340, 100]]} />
      <Dot at={[290, 100]} />
      <Port at={[340, 100]} name="Vout" right />
    </g>
  )
}

function Differential({ i }: { i: Lookup }) {
  return (
    <g>
      <Port at={[34, 85]} name="V1" />
      <Wire pts={[[40, 85], [60, 85]]} />
      <Res at={[60, 85]} info={i('R1')} />
      <Wire pts={[[120, 85], [220, 85]]} />
      <Dot at={[180, 85]} />
      <Wire pts={[[180, 85], [180, 40], [190, 40]]} />
      <Res at={[190, 40]} info={i('R2')} />
      <Wire pts={[[250, 40], [310, 40], [310, 100]]} />
      <Amp at={[220, 100]} plusTop={false} />
      <Port at={[34, 115]} name="V2" />
      <Wire pts={[[40, 115], [60, 115]]} />
      <Res at={[60, 115]} info={i('R3')} side="below" />
      <Wire pts={[[120, 115], [220, 115]]} />
      <Dot at={[180, 115]} />
      <Res at={[180, 115]} v info={i('R4')} />
      <Gnd at={[180, 175]} />
      <Wire pts={[[280, 100], [350, 100]]} />
      <Dot at={[310, 100]} />
      <Port at={[350, 100]} name="Vout" right />
    </g>
  )
}

function Instrumentation({ i }: { i: Lookup }) {
  return (
    <g>
      <Port at={[24, 35]} name="V1" />
      <Wire pts={[[30, 35], [110, 35]]} />
      <Amp at={[110, 50]} plusTop />
      <Wire pts={[[110, 65], [90, 65], [90, 110], [100, 110]]} />
      <Dot at={[90, 110]} />
      <Res at={[100, 110]} info={i('R1')} />
      <Wire pts={[[160, 110], [190, 110], [190, 50]]} />
      <Wire pts={[[170, 50], [230, 50], [230, 130], [240, 130]]} />
      <Dot at={[190, 50]} />
      <Res at={[90, 110]} v info={i('Rg')} side="left" />
      <Dot at={[90, 170]} />
      <Wire pts={[[90, 170], [100, 170]]} />
      <Res at={[100, 170]} info={i('R2')} side="below" />
      <Wire pts={[[160, 170], [190, 170], [190, 240]]} />
      <Dot at={[190, 240]} />
      <Wire pts={[[90, 170], [90, 225], [110, 225]]} />
      <Amp at={[110, 240]} plusTop={false} />
      <Port at={[24, 255]} name="V2" />
      <Wire pts={[[30, 255], [110, 255]]} />
      <Wire pts={[[170, 240], [230, 240], [230, 160], [240, 160]]} />
      <Res at={[240, 130]} info={i('R3')} />
      <Wire pts={[[300, 130], [330, 130]]} />
      <Dot at={[315, 130]} />
      <Wire pts={[[315, 130], [315, 85], [325, 85]]} />
      <Res at={[325, 85]} info={i('R4')} />
      <Wire pts={[[385, 85], [430, 85], [430, 145]]} />
      <Amp at={[330, 145]} plusTop={false} />
      <Res at={[240, 160]} info={i('R5')} side="below" />
      <Wire pts={[[300, 160], [330, 160]]} />
      <Dot at={[315, 160]} />
      <Res at={[315, 160]} v info={i('R6')} />
      <Gnd at={[315, 220]} />
      <Wire pts={[[390, 145], [470, 145]]} />
      <Dot at={[430, 145]} />
      <Port at={[470, 145]} name="Vout" right />
    </g>
  )
}

function Summing({ i }: { i: Lookup }) {
  return (
    <g>
      {[25, 65, 105].map((y, k) => (
        <g key={y}>
          <Port at={[24, y]} name={'V' + (k + 1)} />
          <Wire pts={[[30, y], [60, y]]} />
          <Res at={[60, y]} info={i('R' + (k + 1))} />
          <Wire pts={[[120, y], [190, y]]} />
        </g>
      ))}
      <Wire pts={[[190, 25], [190, 105], [260, 105]]} />
      <Dot at={[190, 65]} />
      <Dot at={[215, 105]} />
      <Wire pts={[[215, 105], [215, 190], [225, 190]]} />
      <Res at={[225, 190]} info={i('Rf')} side="below" />
      <Wire pts={[[285, 190], [350, 190], [350, 120]]} />
      <Amp at={[260, 120]} plusTop={false} />
      <Wire pts={[[260, 135], [240, 135], [240, 150]]} />
      <Gnd at={[240, 150]} />
      <Wire pts={[[320, 120], [410, 120]]} />
      <Dot at={[350, 120]} />
      <Port at={[410, 120]} name="Vout" right />
    </g>
  )
}

/** Sallen-Key: low-pass (R in series, C to ground) or high-pass (the dual). */
function SallenKey({ i, hp, equal }: { i: Lookup; hp: boolean; equal: boolean }) {
  const Ser = hp ? Cap : Res
  const Fb = hp ? Res : Cap
  const Sh = hp ? Res : Cap
  const [s1, s2, fb, sh] = hp ? ['C1', 'C2', 'R1', 'R2'] : ['R1', 'R2', 'C1', 'C2']
  return (
    <g>
      <Port at={[24, 100]} name="Vin" />
      <Wire pts={[[30, 100], [40, 100]]} />
      <Ser at={[40, 100]} info={i(s1)} />
      <Wire pts={[[100, 100], [120, 100]]} />
      <Dot at={[110, 100]} />
      <Ser at={[120, 100]} info={i(s2)} />
      <Wire pts={[[180, 100], [240, 100]]} />
      <Dot at={[190, 100]} />
      <Wire pts={[[110, 100], [110, 50], [130, 50]]} />
      <Fb at={[130, 50]} info={i(fb)} />
      <Wire pts={[[190, 50], [340, 50], [340, 115]]} />
      <Sh at={[190, 100]} v info={i(sh)} side="left" />
      <Gnd at={[190, 160]} />
      <Amp at={[240, 115]} plusTop />
      <Wire pts={[[300, 115], [410, 115]]} />
      <Dot at={[340, 115]} />
      <Port at={[410, 115]} name="Vout" right />
      {equal ? (
        <>
          <Wire pts={[[240, 130], [225, 130], [225, 165], [240, 165]]} />
          <Dot at={[225, 165]} />
          <Res at={[240, 165]} info={i('Rb')} side="below" />
          <Wire pts={[[300, 165], [340, 165], [340, 115]]} />
          <Res at={[225, 165]} v info={i('Ra')} side="left" />
          <Gnd at={[225, 225]} />
        </>
      ) : (
        <Wire pts={[[240, 130], [230, 130], [230, 175], [340, 175], [340, 115]]} />
      )}
    </g>
  )
}

/** Multiple feedback: low-pass (R in the path, C to ground) or band-pass (C in the path, R to ground). */
function Mfb({ i, bp }: { i: Lookup; bp: boolean }) {
  const Path = bp ? Cap : Res
  const Gd = bp ? Res : Cap
  const Across = bp ? Res : Cap
  const Top = bp ? Cap : Res
  const [path, gnd, across, top] = bp ? ['C1', 'R2', 'R3', 'C2'] : ['R2', 'C1', 'C2', 'R3']
  return (
    <g>
      <Port at={[24, 100]} name="Vin" />
      <Wire pts={[[30, 100], [40, 100]]} />
      <Res at={[40, 100]} info={i('R1')} />
      <Wire pts={[[100, 100], [120, 100]]} />
      <Dot at={[110, 100]} />
      <Path at={[120, 100]} info={i(path)} />
      <Wire pts={[[180, 100], [240, 100]]} />
      <Dot at={[205, 100]} />
      <Wire pts={[[110, 100], [110, 50], [130, 50]]} />
      <Top at={[130, 50]} info={i(top)} />
      <Wire pts={[[190, 50], [340, 50], [340, 115]]} />
      <Gd at={[110, 100]} v info={i(gnd)} side="left" />
      <Gnd at={[110, 160]} />
      <Amp at={[240, 115]} plusTop={false} />
      <Wire pts={[[205, 100], [205, 175], [215, 175]]} />
      <Across at={[215, 175]} info={i(across)} side="below" />
      <Wire pts={[[275, 175], [340, 175], [340, 115]]} />
      <Wire pts={[[240, 130], [225, 130], [225, 140]]} />
      <Gnd at={[225, 140]} />
      <Wire pts={[[300, 115], [410, 115]]} />
      <Dot at={[340, 115]} />
      <Port at={[410, 115]} name="Vout" right />
    </g>
  )
}

function Schmitt({ i, vref }: { i: Lookup; vref: string }) {
  return (
    <g>
      <Port at={[24, 100]} name="Vin" />
      <Wire pts={[[30, 100], [240, 100]]} />
      <Amp at={[240, 115]} plusTop={false} />
      <Wire pts={[[240, 130], [210, 130]]} />
      <Dot at={[210, 130]} />
      <Wire pts={[[210, 130], [210, 190], [260, 190]]} />
      <Res at={[260, 190]} info={i('R1')} side="below" />
      <Wire pts={[[320, 190], [350, 190], [350, 115]]} />
      <Dot at={[350, 115]} />
      <Wire pts={[[300, 115], [420, 115]]} />
      <Port at={[420, 115]} name="Vout" right />
      <Wire pts={[[210, 130], [160, 130]]} />
      <Res at={[100, 130]} info={i('R2')} side="below" />
      <Wire pts={[[100, 130], [80, 130]]} />
      {vref === '0' ? (
        <Gnd at={[80, 130]} />
      ) : (
        <>
          <Dot at={[80, 130]} />
          <Txt at={[74, 134]} anchor="end" bold>
            Vref
          </Txt>
          <Txt at={[74, 150]} anchor="end">
            {vref}
          </Txt>
        </>
      )}
    </g>
  )
}

const VIEW: Record<Kind, [number, number]> = {
  inverting: [380, 170],
  noninverting: [390, 250],
  differential: [400, 200],
  instrumentation: [520, 275],
  summing: [450, 225],
  integrator: [380, 170],
  skLp: [450, 245],
  skHp: [450, 245],
  mfbLp: [450, 210],
  mfbBp: [450, 210],
  schmitt: [470, 230],
}

export default function Schematic({ kind, parts, flags, label }: { kind: Kind; parts: Part[]; flags: Design['flags']; label: string }) {
  const by = new Map(parts.map((p) => [p.ref, p]))
  const i: Lookup = (ref) => {
    const p = by.get(ref)
    return { ref, val: p ? formatSI(p.value) : '' }
  }
  const [w0, h] = VIEW[kind]
  const w = w0 + 16
  let body: ReactNode
  switch (kind) {
    case 'inverting':
      body = <Inverting i={i} />
      break
    case 'noninverting':
      body = <NonInverting i={i} />
      break
    case 'differential':
      body = <Differential i={i} />
      break
    case 'instrumentation':
      body = <Instrumentation i={i} />
      break
    case 'summing':
      body = <Summing i={i} />
      break
    case 'integrator':
      body = <Integrator i={i} rf={!!flags.rf} />
      break
    case 'skLp':
    case 'skHp':
      body = <SallenKey i={i} hp={kind === 'skHp'} equal={!!flags.equal} />
      break
    case 'mfbLp':
    case 'mfbBp':
      body = <Mfb i={i} bp={kind === 'mfbBp'} />
      break
    case 'schmitt':
      body = <Schmitt i={i} vref={flags.vref ?? '0'} />
      break
  }
  return (
    <svg className="schematic" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label}>
      <g transform="translate(16,0)">{body}</g>
    </svg>
  )
}
