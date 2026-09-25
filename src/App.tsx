import { useEffect, useState } from 'react'
import Sidebar from './components/Sidebar'
import MapView from './components/MapView'
import ThreeDView from './three/ThreeDView'
import { fetchRoute, fetchWeatherAtHour, type LatLon, type RouteResponse, type WeatherSnapshot } from './lib/api'
import { isoAtMinutes } from './lib/time'
import { useSettledTime } from './hooks/useTime'
import { useDebouncedValue } from './hooks/useDebouncedValue'

const KARLSRUHE_CENTER: LatLon = { lat: 49.0069, lon: 8.4037 }

// Real weather is refreshed on this interval while the toggle is on — no
// point polling more often than a weather API's own data actually changes.
const WEATHER_REFRESH_MS = 15 * 60 * 1000

export default function App() {
  const [origin, setOrigin] = useState<LatLon | null>(null)
  const [destination, setDestination] = useState<LatLon | null>(null)
  const [shadePref, setShadePref] = useState(50)
  // The live time of day lives in timeStore (see lib/timeStore.ts) so the
  // slider, sun and shadows update every frame without re-rendering the app.
  // Network work only follows the settled value.
  const settledMinutes = useSettledTime()
  const debouncedShadePref = useDebouncedValue(shadePref, 300)
  const [pickMode, setPickMode] = useState<'origin' | 'destination' | null>('origin')
  const [viewMode, setViewMode] = useState<'2d' | '3d'>('2d')

  const [route, setRoute] = useState<RouteResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [showWeather, setShowWeather] = useState(false)
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null)
  const [weatherLoading, setWeatherLoading] = useState(false)
  const [weatherError, setWeatherError] = useState<string | null>(null)

  function handleMapClick(point: LatLon) {
    if (pickMode === 'origin') {
      setOrigin(point)
      setPickMode('destination')
    } else if (pickMode === 'destination') {
      setDestination(point)
      setPickMode(null)
      // Picking a destination on the 2D map completes a route — jump to 3D
      // to show it off with the flythrough, rather than leaving the user to
      // switch views manually to see it.
      setViewMode('3d')
    }
  }

  useEffect(() => {
    if (!origin || !destination) {
      setRoute(null)
      setError(null)
      return
    }

    // Time and preference are already debounced/settled above, so this runs
    // once per settled change, not once per slider tick.
    let cancelled = false
    setLoading(true)
    setError(null)

    fetchRoute(origin, destination, debouncedShadePref, isoAtMinutes(settledMinutes))
      .then((data) => {
        if (!cancelled) setRoute(data)
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setRoute(null)
          setError(err.message)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [origin, destination, debouncedShadePref, settledMinutes])

  useEffect(() => {
    if (!showWeather) return

    const point = origin ?? KARLSRUHE_CENTER
    let cancelled = false

    function load() {
      setWeatherLoading(true)
      setWeatherError(null)
      fetchWeatherAtHour(point, settledMinutes / 60)
        .then((data) => {
          if (!cancelled) setWeather(data)
        })
        .catch((err: Error) => {
          if (!cancelled) setWeatherError(err.message)
        })
        .finally(() => {
          if (!cancelled) setWeatherLoading(false)
        })
    }

    // Short debounce so a burst of origin changes (swap, typing) coalesces.
    const timer = setTimeout(load, 300)
    const interval = setInterval(load, WEATHER_REFRESH_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
      clearInterval(interval)
    }
  }, [showWeather, origin, settledMinutes])

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar
        origin={origin}
        destination={destination}
        onOriginChange={setOrigin}
        onDestinationChange={setDestination}
        shadePref={shadePref}
        onShadePrefChange={setShadePref}
        settledMinutes={settledMinutes}
        route={route}
        loading={loading}
        error={error}
        pickMode={pickMode}
        onPickModeChange={setPickMode}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        showWeather={showWeather}
        onShowWeatherChange={setShowWeather}
        weather={weather}
        weatherLoading={weatherLoading}
        weatherError={weatherError}
      />
      <main className="relative flex-1">
        {viewMode === '2d' ? (
          <MapView
            origin={origin}
            destination={destination}
            route={route?.geometry ?? null}
            onMapClick={handleMapClick}
          />
        ) : (
          <ThreeDView
            origin={origin}
            destination={destination}
            route={route?.geometry ?? null}
            onMapClick={handleMapClick}
          />
        )}
      </main>
    </div>
  )
}
