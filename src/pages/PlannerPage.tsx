import Sidebar from '../components/Sidebar'
import MapView from '../components/MapView'
import ThreeDView from '../three/ThreeDView'
import type { Planner } from '../hooks/usePlanner'

/** The default page: side panel + map. */
export default function PlannerPage({ planner: p }: { planner: Planner }) {
  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar
        origin={p.origin}
        destination={p.destination}
        onOriginChange={p.setOrigin}
        onDestinationChange={p.setDestination}
        shadePref={p.shadePref}
        onShadePrefChange={p.setShadePref}
        settledMinutes={p.settledMinutes}
        route={p.route}
        loading={p.loading}
        error={p.error}
        onRetry={p.retry}
        pickMode={p.pickMode}
        onPickModeChange={p.setPickMode}
        viewMode={p.viewMode}
        onViewModeChange={p.setViewMode}
        showWeather={p.showWeather}
        onShowWeatherChange={p.setShowWeather}
        weather={p.weather}
        weatherLoading={p.weatherLoading}
        weatherError={p.weatherError}
      />
      <main className="relative flex-1">
        {p.viewMode === '2d' ? (
          <MapView origin={p.origin} destination={p.destination} route={p.route?.geometry ?? null} onMapClick={p.handleMapClick} />
        ) : (
          <ThreeDView origin={p.origin} destination={p.destination} route={p.route?.geometry ?? null} onMapClick={p.handleMapClick} />
        )}
      </main>
    </div>
  )
}
