import type { TransitVehicle } from '../../lib/api'
import HudPanel from './HudPanel'

const MAX_ROWS = 7

function delayLabel(delayS: number | null): { text: string; className: string } {
  if (delayS == null) return { text: 'scheduled', className: 'text-ink-muted' }
  const min = Math.round(delayS / 60)
  if (min <= 0) return { text: 'on time', className: 'text-emerald-300' }
  return { text: `+${min} min`, className: min >= 5 ? 'text-rose-300' : 'text-hud-amber' }
}

interface TransitPanelProps {
  vehicles: TransitVehicle[] | null
  updatedAt: Date | null
  error: string | null
}

/** Live trams/S-Bahn from the backend's TRIAS feed (the same data the 2D map animates). */
export default function TransitPanel({ vehicles, updatedAt, error }: TransitPanelProps) {
  const rows = (vehicles ?? [])
    .filter((v) => v.calls.length > 1)
    .slice()
    .sort((a, b) => (a.line_name ?? '').localeCompare(b.line_name ?? '', undefined, { numeric: true }))
    .slice(0, MAX_ROWS)

  return (
    <HudPanel
      code="04"
      title="Live transit"
      aside={
        updatedAt ? (
          <span className="flex items-center gap-1.5 font-mono text-[11px] tabular-nums text-ink-muted">
            <span className="h-1.5 w-1.5 animate-shimmer rounded-full bg-emerald-400" aria-hidden="true" />
            {updatedAt.toLocaleTimeString('en-GB')}
          </span>
        ) : undefined
      }
    >
      {!vehicles && !error && <div className="h-24 animate-shimmer rounded-sm bg-surface-muted" aria-busy="true" />}
      {error && !vehicles && <p className="text-sm text-danger-ink">Transit feed unavailable right now.</p>}
      {vehicles && rows.length === 0 && <p className="text-sm text-ink-muted">No vehicles reported nearby right now.</p>}
      {rows.length > 0 && (
        <ul className="flex flex-col divide-y divide-line-soft">
          {rows.map((v) => {
            const delay = delayLabel(v.delay_s)
            return (
              <li key={v.journey_ref} className="flex items-center gap-3 py-2">
                <span
                  className={`flex h-7 min-w-9 items-center justify-center rounded-sm px-1.5 font-mono text-xs font-semibold ${
                    v.mode === 'rail' ? 'bg-violet-500/20 text-violet-200' : 'bg-amber-500/20 text-amber-200'
                  }`}
                >
                  {v.line_name ?? '?'}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-ink">{v.destination_text ?? 'Unknown destination'}</div>
                  <div className="truncate text-[11px] text-ink-muted">next: {v.calls[1]?.stop_name ?? '—'}</div>
                </div>
                <span className={`shrink-0 font-mono text-[11px] tabular-nums ${delay.className}`}>{delay.text}</span>
              </li>
            )
          })}
        </ul>
      )}
    </HudPanel>
  )
}
