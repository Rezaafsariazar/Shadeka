import type { ReactNode } from 'react'

interface HudPanelProps {
  /** Short index shown before the title, e.g. "02". */
  code: string
  title: string
  aside?: ReactNode
  children: ReactNode
  className?: string
}

export default function HudPanel({ code, title, aside, children, className = '' }: HudPanelProps) {
  return (
    <section aria-label={title} className={`hud-frame flex flex-col gap-3 rounded-sm p-4 ${className}`}>
      <header className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-[0.2em] text-ink-muted">
          <span className="text-brand-ink">{code}</span>
          <span aria-hidden="true" className="h-px w-3 bg-brand-accent/50" />
          {title}
        </h2>
        {aside}
      </header>
      {children}
    </section>
  )
}

/** A labelled numeric readout: small mono label above a large value. */
export function Readout({ label, value, unit, tone = 'ink' }: { label: string; value: ReactNode; unit?: string; tone?: 'ink' | 'cyan' | 'amber' }) {
  const color = tone === 'cyan' ? 'text-brand-ink hud-glow' : tone === 'amber' ? 'text-hud-amber' : 'text-ink'
  return (
    <div className="min-w-0">
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">{label}</div>
      <div className={`font-mono text-xl font-medium tabular-nums leading-tight ${color}`}>
        {value}
        {unit && <span className="ml-1 text-xs text-ink-muted">{unit}</span>}
      </div>
    </div>
  )
}
