import type { WeatherKind, WeatherSnapshot } from '../../lib/api'
import { formatMinutes } from '../../lib/time'
import Icon, { type IconName } from '../ui/Icon'
import Switch from '../ui/Switch'
import Section from './Section'

// Shade calculations everywhere else in the app assume a clear sky (see the
// suncalc-driven sun position); above this cloud cover that's misleading
// enough to call out explicitly.
const HEAVY_CLOUD_THRESHOLD_PCT = 60

const KIND_ICON: Record<WeatherKind, { icon: IconName; tint: string }> = {
  clear: { icon: 'sun', tint: 'text-amber-500 bg-amber-50' },
  partly: { icon: 'sun-cloud', tint: 'text-amber-600 bg-amber-50' },
  cloudy: { icon: 'cloud', tint: 'text-slate-600 bg-slate-100' },
  fog: { icon: 'fog', tint: 'text-slate-600 bg-slate-100' },
  rain: { icon: 'rain', tint: 'text-sky-700 bg-sky-50' },
  snow: { icon: 'snow', tint: 'text-sky-700 bg-sky-50' },
  storm: { icon: 'storm', tint: 'text-violet-700 bg-violet-50' },
}

interface WeatherCardProps {
  enabled: boolean
  onEnabledChange: (value: boolean) => void
  minutes: number
  weather: WeatherSnapshot | null
  loading: boolean
  error: string | null
}

export default function WeatherCard({ enabled, onEnabledChange, minutes, weather, loading, error }: WeatherCardProps) {
  return (
    <Section title="Real weather" aside={<Switch checked={enabled} onChange={onEnabledChange} label="Show real weather forecast" />}>
      {!enabled && (
        <p className="text-sm text-ink-muted">Shade assumes a clear sky. Turn on to check today’s forecast for {formatMinutes(minutes)}.</p>
      )}
      {enabled && loading && !weather && (
        <div className="flex items-center gap-3" aria-busy="true">
          <div className="h-10 w-10 animate-shimmer rounded-xl bg-slate-100" />
          <div className="flex flex-col gap-1.5">
            <div className="h-3.5 w-32 animate-shimmer rounded bg-slate-100" />
            <div className="h-3 w-20 animate-shimmer rounded bg-slate-100" />
          </div>
        </div>
      )}
      {enabled && error && (
        <p className="flex items-start gap-1.5 text-sm text-rose-700" role="alert">
          <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
          Weather is unavailable right now.
        </p>
      )}
      {enabled && weather && (
        <div className="flex flex-col gap-3 animate-enter">
          <div className="flex items-center gap-3">
            <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${KIND_ICON[weather.conditionKind].tint}`}>
              <Icon name={KIND_ICON[weather.conditionKind].icon} size={22} />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-ink">
                {weather.conditionLabel} · <span className="tabular-nums">{Math.round(weather.temperatureC)}°C</span>
              </div>
              <div className="text-xs tabular-nums text-ink-muted">
                At {formatMinutes(minutes)} · {Math.round(weather.cloudCoverPct)}% cloud
                {weather.precipitationMm > 0 ? ` · ${weather.precipitationMm} mm rain` : ''}
              </div>
            </div>
          </div>
          {weather.cloudCoverPct >= HEAVY_CLOUD_THRESHOLD_PCT && (
            <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
              <Icon name="cloud" size={16} className="mt-px shrink-0" />
              Mostly overcast then: with little direct sun, a shaded route won’t feel much different.
            </p>
          )}
        </div>
      )}
    </Section>
  )
}
