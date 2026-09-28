import type { CSSProperties } from 'react'
import Section from './Section'

function preferenceLabel(value: number): string {
  if (value <= 20) return 'Fastest'
  if (value <= 40) return 'Mostly fast'
  if (value <= 60) return 'Balanced'
  if (value <= 80) return 'Mostly shaded'
  return 'Shadiest'
}

interface PreferenceSliderProps {
  value: number
  onChange: (value: number) => void
}

export default function PreferenceSlider({ value, onChange }: PreferenceSliderProps) {
  const label = preferenceLabel(value)
  return (
    <Section
      title="Route preference"
      aside={<span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-semibold text-brand-ink">{label}</span>}
    >
      <input
        type="range"
        aria-label="Route preference, fastest to shadiest"
        aria-valuetext={label}
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="range"
        style={{ '--fill': `${value}%` } as CSSProperties}
      />
      <div className="flex justify-between text-xs text-ink-muted">
        <span>Fastest</span>
        <span>Shadiest</span>
      </div>
    </Section>
  )
}
