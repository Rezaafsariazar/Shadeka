import { useEffect, useRef, useState } from 'react'
import type { GeocodeResult, LatLon, RouteResponse, WeatherSnapshot } from '../lib/api'
import { geocodeAddress } from '../lib/api'
import { buildTurnByTurn } from '../lib/directions'

interface SidebarProps {
  origin: LatLon | null
  destination: LatLon | null
  onOriginChange: (value: LatLon | null) => void
  onDestinationChange: (value: LatLon | null) => void
  shadePref: number
  onShadePrefChange: (value: number) => void
  timeHour: number
  onTimeHourChange: (value: number) => void
  route: RouteResponse | null
  loading: boolean
  error: string | null
  pickMode: 'origin' | 'destination' | null
  onPickModeChange: (mode: 'origin' | 'destination' | null) => void
  viewMode: '2d' | '3d'
  onViewModeChange: (mode: '2d' | '3d') => void
  showWeather: boolean
  onShowWeatherChange: (value: boolean) => void
  weather: WeatherSnapshot | null
  weatherLoading: boolean
  weatherError: string | null
}

// Shade calculations everywhere else in the app assume a clear sky (see
// suncalc-driven sun position) — this is the cutoff above which that
// assumption is misleading enough to call out explicitly.
const HEAVY_CLOUD_THRESHOLD_PCT = 60

function formatHour(hour: number): string {
  const h = Math.floor(hour)
  const m = Math.round((hour - h) * 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function formatCoords(value: LatLon | null): string {
  return value ? `${value.lat.toFixed(5)}, ${value.lon.toFixed(5)}` : ''
}

function formatDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`
}

function parseLatLon(text: string): LatLon | null {
  const parts = text.split(',').map((p) => Number.parseFloat(p.trim()))
  if (parts.length !== 2 || parts.some((n) => Number.isNaN(n))) return null
  return { lat: parts[0], lon: parts[1] }
}

function shadePrefLabel(value: number): string {
  if (value <= 20) return 'Fastest route'
  if (value <= 40) return 'Mostly fastest'
  if (value <= 60) return 'Balanced'
  if (value <= 80) return 'Mostly shadiest'
  return 'Shadiest route'
}

/**
 * Drives one address field's text/suggestions/error state. Kept fully
 * controlled (rather than the old defaultValue+remount trick) so a selected
 * geocode result's human-readable label can stay on screen instead of
 * immediately reformatting back to raw coordinates once the parent's
 * `value` prop round-trips through onChange.
 */
function useAddressField(value: LatLon | null, onChange: (v: LatLon | null) => void) {
  const [text, setText] = useState(formatCoords(value))
  const [suggestions, setSuggestions] = useState<GeocodeResult[]>([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  // Set right before an onChange we triggered ourselves (selecting a
  // suggestion, or committing a typed "lat, lon"), so the sync effect below
  // doesn't stomp our just-set display text when `value` round-trips back.
  const justSetRef = useRef(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    if (justSetRef.current) {
      justSetRef.current = false
      return
    }
    setText(formatCoords(value))
    setError(null)
    setSuggestions([])
  }, [value])

  function handleTextChange(next: string) {
    setText(next)
    setError(null)
    setOpen(true)
    clearTimeout(debounceRef.current)

    if (parseLatLon(next) || next.trim().length < 3) {
      setSuggestions([])
      return
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        setSuggestions(await geocodeAddress(next))
      } catch {
        setSuggestions([])
      } finally {
        setSearching(false)
      }
    }, 350)
  }

  function selectSuggestion(s: GeocodeResult) {
    justSetRef.current = true
    setText(s.label)
    setSuggestions([])
    setOpen(false)
    onChange(s.point)
  }

  function commit() {
    setOpen(false)
    const trimmed = text.trim()
    if (trimmed.length === 0) {
      onChange(null)
      setError(null)
      return
    }
    const parsed = parseLatLon(trimmed)
    if (parsed) {
      justSetRef.current = true
      onChange(parsed)
      setText(formatCoords(parsed))
      return
    }
    if (suggestions.length > 0) {
      selectSuggestion(suggestions[0])
      return
    }
    setError('Not found — try a different search, or use Pick to click it on the map.')
  }

  return { text, suggestions, searching, error, open, setOpen, handleTextChange, selectSuggestion, commit }
}

function useMyLocation(onLocated: (p: LatLon) => void) {
  const [locating, setLocating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function locate() {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported in this browser.')
      return
    }
    setLocating(true)
    setError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false)
        onLocated({ lat: pos.coords.latitude, lon: pos.coords.longitude })
      },
      () => {
        setLocating(false)
        setError('Could not get your location — check browser permissions.')
      },
      { enableHighAccuracy: true, timeout: 8000 },
    )
  }

  return { locate, locating, error }
}

function CoordInput({
  label,
  color,
  value,
  onChange,
  active,
  onPick,
}: {
  label: string
  color: string
  value: LatLon | null
  onChange: (v: LatLon | null) => void
  active: boolean
  onPick: () => void
}) {
  const { text, suggestions, searching, error, open, setOpen, handleTextChange, selectSuggestion, commit } =
    useAddressField(value, onChange)

  return (
    <div className="relative flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        <input
          type="text"
          placeholder={`${label} — address or lat, lon`}
          value={text}
          onChange={(e) => handleTextChange(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(commit, 120)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          }}
          className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-teal-400 focus:bg-white focus:ring-2 focus:ring-teal-100"
        />
        <button
          type="button"
          onClick={onPick}
          title={`Click map to set ${label.toLowerCase()}`}
          className={`shrink-0 rounded-lg border px-2.5 py-2 text-xs font-medium transition-colors ${
            active
              ? 'border-teal-500 bg-teal-500 text-white'
              : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
          }`}
        >
          Pick
        </button>
      </div>
      {error && <p className="pl-4 text-xs text-rose-500">{error}</p>}
      {searching && !error && <p className="pl-4 text-xs text-slate-400">Searching…</p>}
      {open && suggestions.length > 0 && (
        <ul className="absolute left-0 right-0 top-full z-30 mt-1 max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white text-sm shadow-lg">
          {suggestions.map((s) => (
            <li key={s.label}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectSuggestion(s)}
                className="block w-full truncate px-3 py-2 text-left hover:bg-slate-50"
              >
                {s.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function Sidebar({
  origin,
  destination,
  onOriginChange,
  onDestinationChange,
  shadePref,
  onShadePrefChange,
  timeHour,
  onTimeHourChange,
  route,
  loading,
  error,
  pickMode,
  onPickModeChange,
  viewMode,
  onViewModeChange,
  showWeather,
  onShowWeatherChange,
  weather,
  weatherLoading,
  weatherError,
}: SidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const { locate, locating, error: locationError } = useMyLocation(onOriginChange)

  function handleSwap() {
    const prevOrigin = origin
    onOriginChange(destination)
    onDestinationChange(prevOrigin)
  }

  const steps = route ? buildTurnByTurn(route.geometry) : []

  return (
    <aside
      className={`fixed inset-x-0 bottom-0 z-20 flex w-full flex-col gap-5 overflow-y-auto rounded-t-2xl bg-white/95 p-5 pt-2 shadow-xl backdrop-blur transition-[max-height] duration-300 ease-out md:static md:h-full md:max-h-none md:w-[380px] md:shrink-0 md:rounded-none md:pt-5 ${
        mobileOpen ? 'max-h-[85vh]' : 'max-h-28'
      }`}
    >
      <button
        type="button"
        onClick={() => setMobileOpen((v) => !v)}
        aria-label={mobileOpen ? 'Collapse panel' : 'Expand panel'}
        className="flex items-center justify-center py-1 md:hidden"
      >
        <span className="h-1.5 w-10 rounded-full bg-slate-300" />
      </button>

      <header className="-mx-5 -mt-2 flex items-center gap-3.5 border-b border-slate-100 bg-gradient-to-br from-teal-50 via-white to-amber-50/60 px-5 py-4 md:-mt-5">
        <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-teal-600 shadow-md shadow-teal-500/25">
          <svg viewBox="0 0 32 32" className="h-8 w-8" fill="none" aria-hidden="true">
            <ellipse cx="16" cy="26" rx="9" ry="2.6" fill="white" fillOpacity="0.3" />
            <rect x="14.6" y="17" width="2.8" height="9" rx="1.2" fill="white" />
            <circle cx="16" cy="12" r="8" fill="white" />
            <circle cx="24.5" cy="5.5" r="2.6" fill="#fde68a" />
          </svg>
        </div>
        <div className="min-w-0">
          <h1 className="text-[22px] font-bold leading-none tracking-tight text-slate-900">
            Shade<span className="bg-gradient-to-r from-teal-500 to-teal-600 bg-clip-text text-transparent">KA</span>
          </h1>
          <p className="mt-1.5 text-[11px] font-medium uppercase leading-none tracking-[0.12em] text-slate-500">
            Shade-aware walking · Karlsruhe
          </p>
        </div>
      </header>

      <div className="flex flex-col gap-2 rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
        <CoordInput
          label="Origin"
          color="#14b8a6"
          value={origin}
          onChange={onOriginChange}
          active={pickMode === 'origin'}
          onPick={() => onPickModeChange(pickMode === 'origin' ? null : 'origin')}
        />
        <div className="flex items-center gap-2 pl-4">
          <button
            type="button"
            onClick={locate}
            className="text-xs font-medium text-teal-600 hover:text-teal-700 disabled:opacity-50"
            disabled={locating}
          >
            {locating ? 'Locating…' : '📍 Use my current location'}
          </button>
        </div>
        {locationError && <p className="pl-4 text-xs text-rose-500">{locationError}</p>}

        <div className="flex justify-center">
          <button
            type="button"
            onClick={handleSwap}
            disabled={!origin && !destination}
            title="Swap origin and destination"
            className="rounded-full border border-slate-200 bg-white p-1 text-sm leading-none text-slate-500 shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-40"
          >
            ⇅
          </button>
        </div>

        <CoordInput
          label="Destination"
          color="#fb7185"
          value={destination}
          onChange={onDestinationChange}
          active={pickMode === 'destination'}
          onPick={() => onPickModeChange(pickMode === 'destination' ? null : 'destination')}
        />
        {pickMode && (
          <p className="text-xs text-teal-600">
            Click anywhere on the map to set the {pickMode}.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-slate-700">Route preference</span>
          <span className="text-xs font-medium text-teal-600">{shadePrefLabel(shadePref)}</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={shadePref}
          onChange={(e) => onShadePrefChange(Number(e.target.value))}
          className="accent-teal-500"
        />
        <div className="flex justify-between text-xs text-slate-400">
          <span>Fastest</span>
          <span>Shadiest</span>
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-slate-700">Time of day</span>
          <span className="text-xs text-slate-400">{formatHour(timeHour)}</span>
        </div>
        <input
          type="range"
          min={6}
          max={21}
          step={0.5}
          value={timeHour}
          onChange={(e) => onTimeHourChange(Number(e.target.value))}
          className="accent-teal-500"
        />
        <div className="flex justify-between text-xs text-slate-400">
          <span>06:00</span>
          <span>21:00</span>
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm font-medium text-slate-700">Real weather right now</span>
            <p className="text-xs text-slate-400">
              Shade above assumes a clear sky — check today's actual conditions.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={showWeather}
            aria-label="Toggle real weather"
            onClick={() => onShowWeatherChange(!showWeather)}
            className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
              showWeather ? 'bg-teal-500' : 'bg-slate-200'
            }`}
          >
            <span
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                showWeather ? 'translate-x-4' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>

        {showWeather && (
          <>
            {weatherLoading && !weather && <p className="text-xs text-slate-400">Loading…</p>}
            {weatherError && <p className="text-xs text-rose-500">{weatherError}</p>}
            {weather && (
              <div className="flex items-center gap-3">
                <span className="text-2xl leading-none">{weather.conditionIcon}</span>
                <div>
                  <div className="text-sm font-medium text-slate-800">
                    {weather.conditionLabel} · {Math.round(weather.temperatureC)}°C
                  </div>
                  <div className="text-xs text-slate-400">
                    {Math.round(weather.cloudCoverPct)}% cloud cover
                    {weather.precipitationMm > 0 ? ` · ${weather.precipitationMm} mm rain` : ''}
                  </div>
                </div>
              </div>
            )}
            {weather && weather.cloudCoverPct >= HEAVY_CLOUD_THRESHOLD_PCT && (
              <p className="rounded-lg bg-amber-50 px-2.5 py-2 text-xs text-amber-700">
                ☁️ Mostly overcast right now — with little direct sun, shaded routes won't feel much
                different from any other route today.
              </p>
            )}
          </>
        )}
      </div>

      <div className="flex rounded-xl border border-slate-100 bg-white p-1 shadow-sm">
        <button
          type="button"
          onClick={() => onViewModeChange('2d')}
          className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
            viewMode === '2d' ? 'bg-teal-500 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'
          }`}
        >
          2D map
        </button>
        <button
          type="button"
          onClick={() => onViewModeChange('3d')}
          className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
            viewMode === '3d' ? 'bg-teal-500 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'
          }`}
        >
          3D fly
        </button>
      </div>

      {loading && (
        <div className="rounded-xl border border-slate-100 bg-white p-4 text-sm text-slate-500 shadow-sm">
          Finding route…
        </div>
      )}

      {error && !loading && (
        <div className="rounded-xl border border-rose-100 bg-rose-50 p-4 text-sm text-rose-600 shadow-sm">
          {error}
        </div>
      )}

      {route && !loading && !error && (
        <div className="flex flex-col gap-3 rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
          <span className="text-sm font-medium text-slate-700">Route summary</span>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-slate-50 py-2.5">
              <div className="text-base font-semibold text-slate-900">
                {(route.distance_m / 1000).toFixed(2)} km
              </div>
              <div className="text-[11px] text-slate-400">distance</div>
            </div>
            <div className="rounded-lg bg-slate-50 py-2.5">
              <div className="text-base font-semibold text-slate-900">
                {Math.round(route.estimated_minutes)} min
              </div>
              <div className="text-[11px] text-slate-400">time</div>
            </div>
            <div className="rounded-lg bg-teal-50 py-2.5">
              <div className="text-base font-semibold text-teal-600">
                {Math.round(route.shade_pct * 100)}%
              </div>
              <div className="text-[11px] text-slate-400">shaded</div>
            </div>
          </div>
        </div>
      )}

      {route && !loading && !error && steps.length > 0 && (
        <div className="flex flex-col gap-1 rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
          <span className="mb-1 text-sm font-medium text-slate-700">Directions</span>
          <ol className="flex flex-col divide-y divide-slate-100">
            {steps.map((step, i) => (
              <li key={i} className="flex items-baseline justify-between gap-3 py-1.5 text-sm text-slate-600">
                <span>{step.instruction}</span>
                {step.distanceM > 0 && (
                  <span className="shrink-0 text-xs text-slate-400">{formatDistance(step.distanceM)}</span>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
    </aside>
  )
}
