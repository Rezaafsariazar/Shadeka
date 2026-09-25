import { useEffect, useState } from 'react'
import Sidebar from './components/Sidebar'
import MapView from './components/MapView'
import ThreeDView from './three/ThreeDView'
import { fetchRoute, isoAtHour, type LatLon, type RouteResponse, type ShadeModel } from './lib/api'

export default function App() {
  const [origin, setOrigin] = useState<LatLon | null>(null)
  const [destination, setDestination] = useState<LatLon | null>(null)
  const [shadePref, setShadePref] = useState(50)
  const [shadeModel, setShadeModel] = useState<ShadeModel>('base')
  const [timeHour, setTimeHour] = useState(14)
  const [pickMode, setPickMode] = useState<'origin' | 'destination' | null>('origin')
  const [viewMode, setViewMode] = useState<'2d' | '3d'>('2d')

  const [route, setRoute] = useState<RouteResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleMapClick(point: LatLon) {
    if (pickMode === 'origin') {
      setOrigin(point)
      setPickMode('destination')
    } else if (pickMode === 'destination') {
      setDestination(point)
      setPickMode(null)
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
      fetchRoute(origin, destination, shadePref, isoAtHour(timeHour), shadeModel)
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
  }, [origin, destination, shadePref, shadeModel, timeHour])

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar
        origin={origin}
        destination={destination}
        onOriginChange={setOrigin}
        onDestinationChange={setDestination}
        shadePref={shadePref}
        onShadePrefChange={setShadePref}
        shadeModel={shadeModel}
        onShadeModelChange={setShadeModel}
        timeHour={timeHour}
        onTimeHourChange={setTimeHour}
        route={route}
        loading={loading}
        error={error}
        pickMode={pickMode}
        onPickModeChange={setPickMode}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
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
