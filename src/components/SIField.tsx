import { useState } from 'react'
import { formatSI, parseSI } from '../lib/format'

type Props = {
  label: string
  unit: string
  value: number
  bad: boolean
  hint?: string
  onChange: (v: number) => void
}

/**
 * A number field that accepts SI suffixes ("4.7k", "100n"). While focused it keeps the raw text;
 * unparsable text gives NaN, which validation flags.
 */
export default function SIField({ label, unit, value, bad, hint, onChange }: Props) {
  const [draft, setDraft] = useState<string | null>(null)
  const shown = !Number.isFinite(value) ? '' : unit === '' && Math.abs(value) >= 1e-3 && Math.abs(value) < 1e6 ? String(+value.toPrecision(5)) : formatSI(value, 4)
  return (
    <label className="field">
      <span>
        {label}
        {unit ? <span className="unit"> ({unit})</span> : null}
      </span>
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        className={bad ? 'bad' : undefined}
        aria-invalid={bad}
        value={draft ?? shown}
        onChange={(e) => {
          setDraft(e.target.value)
          onChange(parseSI(e.target.value) ?? NaN)
        }}
        onBlur={() => setDraft(null)}
      />
      {hint ? <span className="hint">{hint}</span> : null}
    </label>
  )
}
