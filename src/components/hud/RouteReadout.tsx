import type { RouteResponse } from '../../lib/api'
import { formatDistance } from '../../lib/format'
import { formatMinutes } from '../../lib/time'
import { Readout } from './HudPanel'

function shadeTone(pct: number): string {
  if (pct >= 70) return 'text-emerald-300'
  if (pct >= 40) return 'text-hud-amber'
  return 'text-rose-300'
}

interface RouteReadoutProps {
  route: RouteResponse | null
  loading: boolean
  departMinutes: number
}

/** The current route's key numbers, as returned by the routing backend. */
export default function RouteReadout({ route, loading, departMinutes }: RouteReadoutProps) {
  if (!route) {
    return (
      <div className="hud-frame flex items-center gap-3 rounded-sm px-4 py-3 font-mono text-xs uppercase tracking-[0.18em] text-ink-muted">
        <span className={`h-1.5 w-1.5 rounded-full ${loading ? 'animate-shimmer bg-hud-amber' : 'bg-ink-muted'}`} aria-hidden="true" />
        {loading ? 'Computing route…' : 'No route · set start and destination'}
      </div>
    )
  }
  const pct = Math.round(route.shade_pct * 100)
  return (
    <div className="hud-frame grid grid-cols-2 gap-4 rounded-sm px-4 py-3 sm:grid-cols-5" aria-live="polite">
      <div className="col-span-2 flex items-end gap-3 sm:col-span-1">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">In shade</div>
          <div className={`font-mono text-4xl font-medium tabular-nums leading-none ${shadeTone(pct)}`} style={{ textShadow: '0 0 20px currentColor' }}>
            {pct}%
          </div>
        </div>
      </div>
      <Readout label="Distance" value={formatDistance(route.distance_m)} />
      <Readout label="Walk" value={Math.round(route.estimated_minutes)} unit="min" />
      <Readout label="Depart" value={formatMinutes(departMinutes)} tone="cyan" />
      <Readout label="Arrive" value={formatMinutes(departMinutes + route.estimated_minutes)} />
    </div>
  )
}
