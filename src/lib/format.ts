import type { LatLon } from './api'

export function formatCoords(value: LatLon | null): string {
  return value ? `${value.lat.toFixed(5)}, ${value.lon.toFixed(5)}` : ''
}

export function parseLatLon(text: string): LatLon | null {
  const parts = text.split(',').map((p) => Number.parseFloat(p.trim()))
  if (parts.length !== 2 || parts.some((n) => Number.isNaN(n))) return null
  return { lat: parts[0], lon: parts[1] }
}

export function formatDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`
}
