import { useClock } from '../../hooks/useClock'
import Icon from '../ui/Icon'

interface Status {
  label: string
  value: string
  tone?: 'ok' | 'idle' | 'busy'
}

interface HudTopBarProps {
  statuses: Status[]
  onExit: () => void
  onShowShortcuts: () => void
}

const TONE: Record<NonNullable<Status['tone']>, string> = {
  ok: 'bg-emerald-400 shadow-[0_0_8px] shadow-emerald-400',
  busy: 'bg-hud-amber shadow-[0_0_8px] shadow-amber-400 animate-shimmer',
  idle: 'bg-ink-muted',
}

export default function HudTopBar({ statuses, onExit, onShowShortcuts }: HudTopBarProps) {
  const now = useClock()
  const time = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const date = now.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })

  return (
    <header className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-line bg-surface-sunken/80 px-4 py-2.5 backdrop-blur lg:px-6">
      <div className="flex items-center gap-3">
        <div className="relative flex h-8 w-8 items-center justify-center rounded-sm border border-brand-accent/60 shadow-[0_0_16px_-4px] shadow-cyan-400">
          <Icon name="sun" size={18} className="text-brand-ink" />
        </div>
        <div className="leading-tight">
          <div className="font-mono text-sm font-semibold tracking-[0.25em] text-ink">SHADEKA</div>
          <div className="font-mono text-[10px] tracking-[0.3em] text-brand-ink">COMMAND CENTER</div>
        </div>
      </div>

      <ul className="flex flex-1 flex-wrap items-center gap-x-5 gap-y-1" aria-label="System status">
        {statuses.map((s) => (
          <li key={s.label} className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em]">
            <span className={`h-1.5 w-1.5 rounded-full ${TONE[s.tone ?? 'idle']}`} aria-hidden="true" />
            <span className="text-ink-muted">{s.label}</span>
            <span className="text-ink">{s.value}</span>
          </li>
        ))}
      </ul>

      <div className="flex items-center gap-4">
        <div className="text-right leading-tight" aria-label={`Local time ${time}`}>
          <div className="font-mono text-lg tabular-nums text-ink hud-glow">{time}</div>
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-muted">{date} · Karlsruhe</div>
        </div>
        <button
          type="button"
          onClick={onShowShortcuts}
          aria-label="Keyboard shortcuts"
          title="Keyboard shortcuts (?)"
          className="flex h-9 w-9 items-center justify-center rounded-sm border border-line text-ink-soft transition-colors hover:border-brand-accent/60 hover:text-brand-ink"
        >
          <Icon name="keyboard" size={18} />
        </button>
        <button
          type="button"
          onClick={onExit}
          className="flex h-9 items-center gap-2 rounded-sm border border-line px-3 font-mono text-xs uppercase tracking-[0.15em] text-ink-soft transition-colors hover:border-brand-accent/60 hover:text-brand-ink"
        >
          <Icon name="turn-left" size={16} />
          Planner
        </button>
      </div>
    </header>
  )
}
