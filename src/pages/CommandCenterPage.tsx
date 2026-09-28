import { useMemo, useState } from 'react'
import * as SunCalc from 'suncalc'
import type { Planner } from '../hooks/usePlanner'
import { KARLSRUHE_CENTER } from '../hooks/usePlanner'
import { navigate } from '../hooks/useHashRoute'
import { useDayForecast } from '../hooks/useDayForecast'
import { useShadeByHour } from '../hooks/useShadeByHour'
import { useTransitFeed } from '../hooks/useTransitFeed'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { useHudShortcuts } from '../hooks/useHudShortcuts'
import { dateAtMinutes } from '../lib/time'
import MapView from '../components/MapView'
import ThreeDView from '../three/ThreeDView'
import SegmentedToggle from '../components/ui/SegmentedToggle'
import Icon from '../components/ui/Icon'
import RouteInputs from '../components/sidebar/RouteInputs'
import PreferenceSlider from '../components/sidebar/PreferenceSlider'
import TimeControl from '../components/sidebar/TimeControl'
import HudPanel from '../components/hud/HudPanel'
import HudTopBar from '../components/hud/HudTopBar'
import SunArcPanel from '../components/hud/SunArcPanel'
import ComfortPanel from '../components/hud/ComfortPanel'
import BestTimePanel from '../components/hud/BestTimePanel'
import TransitPanel from '../components/hud/TransitPanel'
import RouteReadout from '../components/hud/RouteReadout'
import ShortcutsDialog from '../components/hud/ShortcutsDialog'

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
const VIEW_OPTIONS = [
  { value: '2d' as const, label: '2D map' },
  { value: '3d' as const, label: '3D city' },
]

/**
 * "Command center": the same planner (shared state via usePlanner) laid out
 * as a dark HUD dashboard, plus panels built only from real data — the
 * backend's routes for every hour, Open-Meteo's forecast, suncalc's solar
 * track and the live TRIAS transit feed.
 */
export default function CommandCenterPage({ planner: p }: { planner: Planner }) {
  const [helpOpen, setHelpOpen] = useState(false)
  const [replayRequest, setReplayRequest] = useState(0)
  const center = p.origin ?? KARLSRUHE_CENTER
  const forecast = useDayForecast(center)
  const shadePref = useDebouncedValue(p.shadePref, 600)
  const byHour = useShadeByHour(p.origin, p.destination, shadePref)
  const transit = useTransitFeed()

  useHudShortcuts({
    setView: p.setViewMode,
    replayFlythrough: () => setReplayRequest((n) => n + 1),
    exit: () => navigate('planner'),
    toggleHelp: () => setHelpOpen((o) => !o),
  })

  const statuses = useMemo(() => {
    const sun = SunCalc.getPosition(dateAtMinutes(p.settledMinutes), center.lat, center.lon)
    const hour = Math.round(p.settledMinutes / 60)
    const wx = forecast.data?.find((f) => f.hour === hour)
    return [
      {
        label: 'Route',
        value: p.loading ? 'computing' : p.route ? 'locked' : p.error ? 'error' : 'standby',
        tone: p.loading ? ('busy' as const) : p.route ? ('ok' as const) : ('idle' as const),
      },
      {
        label: 'Sun',
        value: sun.altitude > 0 ? `${Math.round(sun.altitude)}° ${COMPASS[Math.round((((sun.azimuth % 360) + 360) % 360) / 45) % 8]}` : 'below horizon',
        tone: sun.altitude > 0 ? ('ok' as const) : ('idle' as const),
      },
      { label: 'Wx', value: wx ? `${Math.round(wx.temperatureC)}°C · UV ${wx.uvIndex.toFixed(0)}` : '—', tone: wx ? ('ok' as const) : ('idle' as const) },
      { label: 'Transit', value: transit.vehicles ? `${transit.vehicles.length} live` : '—', tone: transit.vehicles ? ('ok' as const) : ('idle' as const) },
    ]
  }, [p.settledMinutes, p.loading, p.route, p.error, center.lat, center.lon, forecast.data, transit.vehicles])

  const routeGeometry = p.route?.geometry ?? null

  return (
    <div className="theme-hud flex min-h-dvh flex-col lg:h-dvh lg:overflow-hidden">
      <HudTopBar statuses={statuses} onExit={() => navigate('planner')} onShowShortcuts={() => setHelpOpen(true)} />

      <div className="grid flex-1 gap-3 p-3 lg:min-h-0 lg:grid-cols-[340px_minmax(0,1fr)_360px] lg:p-4">
        <aside aria-label="Mission controls" className="flex flex-col gap-3 lg:min-h-0 lg:overflow-y-auto lg:pr-1">
          <HudPanel code="00" title="Mission">
            <RouteInputs
              origin={p.origin}
              destination={p.destination}
              onOriginChange={p.setOrigin}
              onDestinationChange={p.setDestination}
              pickMode={p.pickMode}
              onPickModeChange={p.setPickMode}
            />
            {p.error && !p.loading && (
              <div role="alert" className="flex items-center justify-between gap-3 border-l-2 border-rose-400 pl-2.5 text-xs text-danger-ink">
                Routing service didn’t respond.
                <button type="button" onClick={p.retry} className="font-mono uppercase tracking-[0.15em] text-brand-ink hover:underline">
                  Retry
                </button>
              </div>
            )}
            <div className="-mb-4">
              <PreferenceSlider value={p.shadePref} onChange={p.setShadePref} />
              <TimeControl />
            </div>
          </HudPanel>
          <p className="hidden px-1 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted lg:block">
            Press <kbd className="text-brand-ink">?</kbd> for keyboard shortcuts
          </p>
        </aside>

        <main className="flex min-h-[60vh] flex-col gap-3 lg:min-h-0">
          <div className="hud-frame relative flex-1 overflow-hidden rounded-sm">
            {p.viewMode === '2d' ? (
              <MapView origin={p.origin} destination={p.destination} route={routeGeometry} onMapClick={p.handleMapClick} />
            ) : (
              <ThreeDView
                origin={p.origin}
                destination={p.destination}
                route={routeGeometry}
                onMapClick={p.handleMapClick}
                replayRequest={replayRequest}
              />
            )}
            <div className="pointer-events-none absolute inset-0 border border-brand-accent/10" aria-hidden="true" />
            <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2">
              <SegmentedToggle label="Map view" tone="overlay" size="sm" className="w-52" options={VIEW_OPTIONS} value={p.viewMode} onChange={p.setViewMode} />
              {p.viewMode === '3d' && p.route && (
                <button
                  type="button"
                  onClick={() => setReplayRequest((n) => n + 1)}
                  className="flex h-10 items-center gap-2 rounded-xl border border-line bg-overlay px-3 font-mono text-[11px] uppercase tracking-[0.15em] text-brand-ink shadow-(--shadow-overlay) backdrop-blur transition-colors hover:border-brand-accent/60"
                >
                  <Icon name="film" size={16} />
                  Fly
                </button>
              )}
            </div>
          </div>
          <RouteReadout route={p.route} loading={p.loading} departMinutes={p.settledMinutes} />
        </main>

        <aside aria-label="Live data" className="flex flex-col gap-3 lg:min-h-0 lg:overflow-y-auto lg:pl-1">
          <SunArcPanel center={center} />
          <ComfortPanel forecast={forecast.data} error={forecast.error} />
          <BestTimePanel hasRoute={Boolean(p.origin && p.destination)} data={byHour.data} hours={byHour.hours} error={byHour.error} />
          <TransitPanel vehicles={transit.vehicles} updatedAt={transit.updatedAt} error={transit.error} />
        </aside>
      </div>

      <ShortcutsDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  )
}
