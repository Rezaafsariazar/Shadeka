import type { HourlyConditions, WeatherKind } from '../../lib/api'
import { useTimeTarget } from '../../hooks/useTime'
import Icon, { type IconName } from '../ui/Icon'
import HudPanel, { Readout } from './HudPanel'

const KIND_ICON: Record<WeatherKind, IconName> = {
  clear: 'sun',
  partly: 'sun-cloud',
  cloudy: 'cloud',
  fog: 'fog',
  rain: 'rain',
  snow: 'snow',
  storm: 'storm',
}

// WHO UV index categories.
function uvCategory(uv: number): { label: string; className: string } {
  if (uv < 3) return { label: 'Low', className: 'text-emerald-300' }
  if (uv < 6) return { label: 'Moderate', className: 'text-yellow-300' }
  if (uv < 8) return { label: 'High', className: 'text-orange-300' }
  if (uv < 11) return { label: 'Very high', className: 'text-rose-300' }
  return { label: 'Extreme', className: 'text-fuchsia-300' }
}

/** What the conditions mean for choosing a shaded route, from real forecast values. */
function advice(c: HourlyConditions): string {
  if (c.cloudCoverPct >= 60) return 'Mostly overcast: shade makes little difference at this hour.'
  if (c.apparentC >= 30 || c.uvIndex >= 8) return 'Heat stress risk: take the shadiest route.'
  if (c.apparentC >= 24 || c.uvIndex >= 6) return 'Warm sun: a shaded route is noticeably more comfortable.'
  if (c.apparentC <= 8) return 'Cold: sunny streets may feel better than shade.'
  return 'Mild: pick by preference.'
}

interface ComfortPanelProps {
  forecast: HourlyConditions[] | null
  error: string | null
}

export default function ComfortPanel({ forecast, error }: ComfortPanelProps) {
  // Subscribes itself so scrubbing re-renders only this panel.
  const hour = Math.min(23, Math.round(useTimeTarget() / 60))
  const c = forecast?.find((f) => f.hour === hour) ?? null
  const uv = c ? uvCategory(c.uvIndex) : null

  return (
    <HudPanel
      code="02"
      title="Heat & comfort"
      aside={<span className="font-mono text-[11px] text-ink-muted">{String(hour).padStart(2, '0')}:00 · Open-Meteo</span>}
    >
      {error && !c && <p className="text-sm text-danger-ink">Forecast unavailable right now.</p>}
      {!c && !error && <div className="h-24 animate-shimmer rounded-sm bg-surface-muted" aria-busy="true" />}
      {c && uv && (
        <>
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-sm border border-line text-hud-amber">
              <Icon name={KIND_ICON[c.conditionKind]} size={24} />
            </span>
            <div>
              <div className="font-mono text-3xl font-medium tabular-nums leading-none text-ink hud-glow">
                {Math.round(c.temperatureC)}°
              </div>
              <div className="mt-1 text-xs text-ink-soft">{c.conditionLabel}</div>
            </div>
            <div className="ml-auto text-right">
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">UV index</div>
              <div className={`font-mono text-xl tabular-nums ${uv.className}`}>{c.uvIndex.toFixed(1)}</div>
              <div className={`text-[11px] ${uv.className}`}>{uv.label}</div>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2">
            <Readout label="Feels" value={`${Math.round(c.apparentC)}°`} tone="amber" />
            <Readout label="Humid" value={Math.round(c.humidityPct)} unit="%" />
            <Readout label="Wind" value={Math.round(c.windKmh)} unit="km/h" />
            <Readout label="Cloud" value={Math.round(c.cloudCoverPct)} unit="%" />
          </div>
          <p className="border-l-2 border-brand-accent/60 pl-2.5 text-xs text-ink-soft">{advice(c)}</p>
        </>
      )}
    </HudPanel>
  )
}
