import { useMemo } from 'react'
import { useBottomSheet } from '../hooks/useBottomSheet'
import { formatDistance } from '../lib/format'
import type { LatLon, RouteResponse, WeatherSnapshot } from '../lib/api'
import { buildTurnByTurn } from '../lib/directions'
import SegmentedToggle from './ui/SegmentedToggle'
import BrandHeader from './sidebar/BrandHeader'
import RouteInputs from './sidebar/RouteInputs'
import EmptyState from './sidebar/EmptyState'
import RouteSummary, { RouteSummarySkeleton } from './sidebar/RouteSummary'
import RouteError from './sidebar/RouteError'
import PreferenceSlider from './sidebar/PreferenceSlider'
import TimeControl from './sidebar/TimeControl'
import WeatherCard from './sidebar/WeatherCard'
import DirectionsList from './sidebar/DirectionsList'

type ViewMode = '2d' | '3d'
type PickMode = 'origin' | 'destination' | null

interface SidebarProps {
  origin: LatLon | null
  destination: LatLon | null
  onOriginChange: (value: LatLon | null) => void
  onDestinationChange: (value: LatLon | null) => void
  shadePref: number
  onShadePrefChange: (value: number) => void
  /** Time the current route/weather data was fetched for (not the live slider value). */
  settledMinutes: number
  route: RouteResponse | null
  loading: boolean
  error: string | null
  onRetry: () => void
  pickMode: PickMode
  onPickModeChange: (mode: PickMode) => void
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  showWeather: boolean
  onShowWeatherChange: (value: boolean) => void
  weather: WeatherSnapshot | null
  weatherLoading: boolean
  weatherError: string | null
}

const VIEW_OPTIONS = [
  { value: '2d' as const, label: '2D' },
  { value: '3d' as const, label: '3D' },
]

export default function Sidebar(props: SidebarProps) {
  const { route, loading, error } = props
  // Mobile peek shows the header, plus a one-line route summary once a route exists.
  const sheet = useBottomSheet(route ? 156 : 120)
  const steps = useMemo(() => (route ? buildTurnByTurn(route.geometry) : []), [route])

  const showError = Boolean(error) && !loading
  // Directly under the inputs: guidance before a route exists, or the error.
  let notice = null
  if (showError && error) notice = <RouteError detail={error} onRetry={props.onRetry} />
  else if (!route && !loading && (!props.origin || !props.destination)) notice = <EmptyState />
  // Refetches (time, preference) keep the previous result on screen and just
  // flag it as updating, instead of swapping it for a loader.
  let result = null
  if (!showError && route) result = <RouteSummary route={route} updating={loading} />
  else if (!showError && loading) result = <RouteSummarySkeleton />

  return (
    <aside
      aria-label="Route planner"
      style={sheet.style}
      className={`fixed inset-x-0 bottom-0 z-20 flex max-h-(--sheet-h) w-full flex-col overscroll-contain rounded-t-[1.25rem] bg-surface px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-(--shadow-sheet) transition-[max-height] duration-300 ease-(--ease-out-soft) md:static md:h-full md:max-h-none md:w-[400px] md:shrink-0 md:rounded-none md:border-r md:border-line md:pt-5 md:shadow-none ${
        sheet.open ? 'overflow-y-auto' : 'overflow-hidden md:overflow-y-auto'
      }`}
    >
      <button
        type="button"
        {...sheet.handleProps}
        aria-label={sheet.open ? 'Collapse route planner' : 'Expand route planner'}
        aria-expanded={sheet.open}
        className="sticky top-0 z-10 -mx-5 flex h-7 shrink-0 touch-none items-center justify-center bg-surface md:hidden"
      >
        <span className="h-1.5 w-10 rounded-full bg-slate-300" />
      </button>

      <div className="pb-5">
        <BrandHeader>
          <SegmentedToggle
            label="Map view"
            size="sm"
            options={VIEW_OPTIONS}
            value={props.viewMode}
            onChange={props.onViewModeChange}
            className="w-24 shrink-0"
          />
        </BrandHeader>
        {route && !sheet.open && (
          <p className="mt-3 flex items-center gap-2 text-sm text-ink-soft md:hidden">
            <span className="font-semibold text-brand tabular-nums">{Math.round(route.shade_pct * 100)}% shade</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">{formatDistance(route.distance_m)}</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">{Math.round(route.estimated_minutes)} min</span>
          </p>
        )}
      </div>

      <div className="flex flex-col gap-4 pb-5">
        <RouteInputs
          origin={props.origin}
          destination={props.destination}
          onOriginChange={props.onOriginChange}
          onDestinationChange={props.onDestinationChange}
          pickMode={props.pickMode}
          onPickModeChange={(mode) => {
            // On phones the expanded sheet covers the map; get out of the way.
            if (mode) sheet.setOpen(false)
            props.onPickModeChange(mode)
          }}
        />
        {notice}
      </div>

      {result}

      <PreferenceSlider value={props.shadePref} onChange={props.onShadePrefChange} />
      <TimeControl />
      <WeatherCard
        enabled={props.showWeather}
        onEnabledChange={props.onShowWeatherChange}
        minutes={props.settledMinutes}
        weather={props.weather}
        loading={props.weatherLoading}
        error={props.weatherError}
      />
      {route && !showError && steps.length > 0 && <DirectionsList steps={steps} />}
    </aside>
  )
}
