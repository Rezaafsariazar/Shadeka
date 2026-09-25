import type { LatLon, RouteResponse, ShadeModel } from '../lib/api'
import TemperatureProfileChart from './TemperatureProfileChart'

interface SidebarProps {
  origin: LatLon | null
  destination: LatLon | null
  onOriginChange: (value: LatLon | null) => void
  onDestinationChange: (value: LatLon | null) => void
  shadePref: number
  onShadePrefChange: (value: number) => void
  shadeModel: ShadeModel
  onShadeModelChange: (value: ShadeModel) => void
  timeHour: number
  onTimeHourChange: (value: number) => void
  route: RouteResponse | null
  loading: boolean
  error: string | null
  pickMode: 'origin' | 'destination' | null
  onPickModeChange: (mode: 'origin' | 'destination' | null) => void
  viewMode: '2d' | '3d'
  onViewModeChange: (mode: '2d' | '3d') => void
}

function formatHour(hour: number): string {
  const h = Math.floor(hour)
  const m = Math.round((hour - h) * 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function parseLatLon(text: string): LatLon | null {
  const parts = text.split(',').map((p) => Number.parseFloat(p.trim()))
  if (parts.length !== 2 || parts.some((n) => Number.isNaN(n))) return null
  return { lat: parts[0], lon: parts[1] }
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
  return (
    <div className="flex items-center gap-2">
      <span
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
      />
      <input
        type="text"
        placeholder={`${label} (lat, lon)`}
        defaultValue={value ? `${value.lat.toFixed(5)}, ${value.lon.toFixed(5)}` : ''}
        key={value ? `${value.lat},${value.lon}` : label}
        onBlur={(e) => onChange(parseLatLon(e.target.value))}
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
  )
}

export default function Sidebar({
  origin,
  destination,
  onOriginChange,
  onDestinationChange,
  shadePref,
  onShadePrefChange,
  shadeModel,
  onShadeModelChange,
  timeHour,
  onTimeHourChange,
  route,
  loading,
  error,
  pickMode,
  onPickModeChange,
  viewMode,
  onViewModeChange,
}: SidebarProps) {
  return (
    <aside className="z-10 flex h-full w-[380px] shrink-0 flex-col gap-5 overflow-y-auto bg-white/95 p-5 shadow-xl backdrop-blur">
      <header className="-mx-5 -mt-5 flex items-center gap-3.5 border-b border-slate-100 bg-gradient-to-br from-teal-50 via-white to-amber-50/60 px-5 py-4">
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

      <div className="flex flex-col gap-3 rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
        <CoordInput
          label="Origin"
          color="#14b8a6"
          value={origin}
          onChange={onOriginChange}
          active={pickMode === 'origin'}
          onPick={() => onPickModeChange(pickMode === 'origin' ? null : 'origin')}
        />
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
          <span className="text-xs text-slate-400">{shadePref}</span>
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
        <span className="text-sm font-medium text-slate-700">Shade model</span>
        <div className="flex rounded-lg border border-slate-100 bg-slate-50 p-1">
          <button
            type="button"
            onClick={() => onShadeModelChange('base')}
            className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${
              shadeModel === 'base' ? 'bg-teal-500 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            Standard
          </button>
          <button
            type="button"
            onClick={() => onShadeModelChange('advanced')}
            className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${
              shadeModel === 'advanced' ? 'bg-teal-500 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            Advanced
          </button>
        </div>
        <p className="text-xs text-slate-400">
          {shadeModel === 'advanced'
            ? 'Accounts for lingering heat on recently-sunny streets, not just current shade.'
            : 'Uses current shade coverage only.'}
        </p>
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

      {route && !loading && !error && route.temperature_profile && shadeModel === 'advanced' && (
        <TemperatureProfileChart profile={route.temperature_profile} />
      )}
    </aside>
  )
}
