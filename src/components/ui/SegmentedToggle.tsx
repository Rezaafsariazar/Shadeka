import type { ReactNode } from 'react'

export interface SegmentOption<T extends string> {
  value: T
  label: ReactNode
}

interface SegmentedToggleProps<T extends string> {
  options: SegmentOption<T>[]
  value: T
  onChange: (value: T) => void
  label: string
  /** "light" for panels, "overlay" for controls floating over the map. */
  tone?: 'light' | 'overlay'
  size?: 'sm' | 'md'
  className?: string
}

/**
 * Pill toggle whose active indicator slides between options. Behaves as a
 * radio group: arrow keys move the selection, only the active option is in
 * the tab order.
 */
export default function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
  label,
  tone = 'light',
  size = 'md',
  className = '',
}: SegmentedToggleProps<T>) {
  const index = Math.max(0, options.findIndex((o) => o.value === value))
  const container = tone === 'overlay' ? 'bg-overlay border border-line shadow-(--shadow-overlay) backdrop-blur' : 'bg-surface-muted'
  const height = size === 'sm' ? 'h-8 text-xs' : 'h-10 text-sm'

  function move(delta: number) {
    const next = options[(index + delta + options.length) % options.length]
    onChange(next.value)
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`relative grid rounded-xl p-1 ${container} ${className}`}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault()
          move(1)
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault()
          move(-1)
        }
      }}
    >
      <span
        aria-hidden="true"
        className="absolute bottom-1 left-1 top-1 rounded-lg bg-surface-raised shadow-sm ring-1 ring-ink/5 transition-transform duration-200 ease-(--ease-out-soft)"
        style={{
          width: `calc((100% - 0.5rem) / ${options.length})`,
          transform: `translateX(${index * 100}%)`,
        }}
      />
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={`relative z-10 inline-flex items-center justify-center gap-1.5 rounded-lg px-3 font-medium transition-colors duration-200 ${height} ${
              active ? 'text-ink' : 'text-ink-muted hover:text-ink-soft'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
