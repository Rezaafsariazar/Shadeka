import { useState } from 'react'
import type { LatLon } from '../lib/api'

export function useMyLocation(onLocated: (p: LatLon) => void) {
  const [locating, setLocating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function locate() {
    if (!navigator.geolocation) {
      setError('Location is not available in this browser.')
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
        setError('Could not get your location. Check the browser’s location permission.')
      },
      { enableHighAccuracy: true, timeout: 8000 },
    )
  }

  return { locate, locating, error }
}
