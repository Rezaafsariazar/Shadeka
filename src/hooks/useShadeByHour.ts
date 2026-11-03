import { useEffect, useState } from 'react'
import { fetchRoute, type LatLon } from '../lib/api'
import { isoAtMinutes, TIME_MAX, TIME_MIN } from '../lib/time'

export interface HourlyShade {
  hour: number
  shadePct: number
  minutes: number
}

const HOURS = Array.from({ length: (TIME_MAX - TIME_MIN) / 60 + 1 }, (_, i) => TIME_MIN / 60 + i)
// Parallel requests at a time — enough to fill the chart quickly without
// hammering the backend with all 16 at once.
const CONCURRENCY = 4
const cache = new Map<string, HourlyShade>()

/**
 * The real route (same origin, destination and preference) computed by the
 * backend for every whole hour of the day, to show when the walk is shadiest.
 * Results are cached per inputs, so revisiting a route is instant.
 */
export function useShadeByHour(origin: LatLon | null, destination: LatLon | null, shadePref: number) {
  const [data, setData] = useState<(HourlyShade | null)[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!origin || !destination) {
      const timer = setTimeout(() => setData(null), 0)
      return () => clearTimeout(timer)
    }
    let cancelled = false
    const keyBase = `${origin.lat},${origin.lon}|${destination.lat},${destination.lon}|${shadePref}`
    const results: (HourlyShade | null)[] = HOURS.map((h) => cache.get(`${keyBase}|${h}`) ?? null)
    const queue = HOURS.filter((_, i) => results[i] === null)

    const publish = () => {
      if (!cancelled) setData([...results])
    }
    const timer = setTimeout(publish, 0)

    async function worker() {
      while (queue.length > 0 && !cancelled) {
        const hour = queue.shift()!
        try {
          const route = await fetchRoute(origin!, destination!, shadePref, isoAtMinutes(hour * 60))
          const entry = { hour, shadePct: Math.round(route.shade_pct * 100), minutes: Math.round(route.estimated_minutes) }
          cache.set(`${keyBase}|${hour}`, entry)
          results[HOURS.indexOf(hour)] = entry
          publish()
        } catch (err) {
          if (!cancelled) setError((err as Error).message)
        }
      }
    }
    for (let i = 0; i < CONCURRENCY; i++) void worker()

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [origin, destination, shadePref])

  return { data, error, hours: HOURS }
}
