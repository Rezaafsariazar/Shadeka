import { useEffect, useState } from 'react'
import { fetchDayForecast, type HourlyConditions, type LatLon } from '../lib/api'

const REFRESH_MS = 30 * 60 * 1000

export function useDayForecast(point: LatLon) {
  const [data, setData] = useState<HourlyConditions[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { lat, lon } = point

  useEffect(() => {
    let cancelled = false
    const load = () =>
      fetchDayForecast({ lat, lon })
        .then((d) => {
          if (!cancelled) {
            setData(d)
            setError(null)
          }
        })
        .catch((err: Error) => {
          if (!cancelled) setError(err.message)
        })
    const timer = setTimeout(load, 0)
    const interval = setInterval(load, REFRESH_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
      clearInterval(interval)
    }
  }, [lat, lon])

  return { data, error }
}
