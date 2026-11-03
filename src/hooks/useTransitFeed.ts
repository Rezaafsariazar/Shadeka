import { useEffect, useState } from 'react'
import { fetchTransitNearby, type TransitVehicle } from '../lib/api'

// Same cadence as the 2D map's transit layer (the endpoint does real TRIAS
// work per request and takes several seconds).
const POLL_MS = 20000

export function useTransitFeed() {
  const [vehicles, setVehicles] = useState<TransitVehicle[] | null>(null)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    const poll = () => {
      fetchTransitNearby()
        .then((d) => {
          if (cancelled) return
          setVehicles(d.vehicles)
          setUpdatedAt(new Date())
          setError(null)
        })
        .catch((err: Error) => {
          if (!cancelled) setError(err.message)
        })
        .finally(() => {
          if (!cancelled) timer = setTimeout(poll, POLL_MS)
        })
    }
    timer = setTimeout(poll, 0)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [])

  return { vehicles, updatedAt, error }
}
