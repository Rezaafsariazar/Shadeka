import { useEffect, useState } from 'react'
import Sidebar from './components/Sidebar'
import MapView from './components/MapView'
import ThreeDView from './three/ThreeDView'
import { fetchRoute, fetchWeatherAtHour, isoAtHour, type LatLon, type RouteResponse, type WeatherSnapshot } from './lib/api'

const KARLSRUHE_CENTER: LatLon = { lat: 49.0069, lon: 8.4037 }

// Real weather is refreshed on this interval while the toggle is on — no
// point polling more often than a weather API's own data actually changes.
const WEATHER_REFRESH_MS = 15 * 60 * 1000

export default function App() {
  const [origin, setOrigin] = useState<LatLon | null>(null)
  const [destination, setDestination] = useState<LatLon | null>(null)
  const [shadePref, setShadePref] = useState(50)
  const [timeHour, setTimeHour] = useState(14)
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

    let cancelled = false
    setLoading(true)
    setError(null)

    const timer = setTimeout(() => {
      fetchRoute(origin, destination, shadePref, isoAtHour(timeHour))
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
    }, 300)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [origin, destination, shadePref, timeHour])

  useEffect(() => {
    if (!showWeather) return

    const point = origin ?? KARLSRUHE_CENTER
    let cancelled = false

    function load() {
      setWeatherLoading(true)
      setWeatherError(null)
      fetchWeatherAtHour(point, timeHour)
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

    // Debounced like the route fetch above — dragging the time slider fires
    // this on every step, and there's no need to refetch the whole day's
    // hourly forecast for each intermediate value.
    const timer = setTimeout(load, 300)
    const interval = setInterval(load, WEATHER_REFRESH_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
      clearInterval(interval)
    }
  }, [showWeather, origin, timeHour])

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar
        origin={origin}
        destination={destination}
        onOriginChange={setOrigin}
        onDestinationChange={setDestination}
        shadePref={shadePref}
        onShadePrefChange={setShadePref}
        timeHour={timeHour}
        onTimeHourChange={setTimeHour}
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
            timeHour={timeHour}
            onMapClick={handleMapClick}
          />
        ) : (
          <ThreeDView
            timeHour={timeHour}
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
