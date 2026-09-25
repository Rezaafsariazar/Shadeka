export interface LatLon {
  lat: number
  lon: number
}

export interface RouteResponse {
  time_bucket: string
  distance_m: number
  estimated_minutes: number
  shade_pct: number
  geometry: GeoJSON.LineString
}

export interface BuildingProperties {
  /** Stable building id, used to skip buildings already loaded when fetches overlap. */
  id: number
  height_m: number | null
}

export interface TreeProperties {
  height_m: number
  crown_radius_m: number
}

export type BuildingsResponse = GeoJSON.FeatureCollection<
  GeoJSON.Polygon | GeoJSON.MultiPolygon,
  BuildingProperties
>

export type TreesResponse = GeoJSON.FeatureCollection<GeoJSON.Point, TreeProperties>

export interface TransitCall {
  stop_name: string
  lon: number
  lat: number
  /** ISO timestamp, or null if this call has no scheduled arrival/departure (e.g. the very first/last stop of what was sent). */
  arrival: string | null
  departure: string | null
}

export interface TransitSegment {
  /** Real curved track polyline from calls[i] to calls[i+1], running in that order. */
  coordinates: [number, number][]
}

export interface TransitVehicle {
  journey_ref: string
  line_name: string | null
  mode: 'tram' | 'rail'
  direction: string | null
  /** The trip's true first stop (not the windowed remaining-schedule slice below). */
  origin_text: string | null
  destination_text: string | null
  delay_s: number | null
  /** Remaining schedule from the vehicle's current position onward — enough calls to animate through several poll intervals without needing a position update. */
  calls: TransitCall[]
  /** segments[i] connects calls[i] to calls[i+1]; one shorter than calls. */
  segments: TransitSegment[]
}

export interface TransitNearbyResponse {
  vehicles: TransitVehicle[]
}

const API_URL = import.meta.env.VITE_API_URL ?? 'http://92.5.24.223:8000'

export async function fetchRoute(
  origin: LatLon,
  destination: LatLon,
  shadePref: number,
  at: string,
): Promise<RouteResponse> {
  const params = new URLSearchParams({
    origin_lat: String(origin.lat),
    origin_lon: String(origin.lon),
    dest_lat: String(destination.lat),
    dest_lon: String(destination.lon),
    shade_pref: String(shadePref),
    at,
    // The backend also offers an "advanced" model (accounts for lingering
    // heat on recently-sunny streets); dropped from the UI as not practical
    // for users to reason about, so always request the plain shade-coverage
    // one.
    shade_model: 'base',
  })

  const res = await fetch(`${API_URL}/route?${params.toString()}`)
  if (!res.ok) {
    throw new Error(`Route request failed: ${res.status} ${res.statusText}`)
  }
  return res.json()
}

export async function fetchBuildingsNearby(center: LatLon, radiusM = 400): Promise<BuildingsResponse> {
  const params = new URLSearchParams({
    lat: String(center.lat),
    lon: String(center.lon),
    radius_m: String(radiusM),
  })
  const res = await fetch(`${API_URL}/buildings-nearby?${params.toString()}`)
  if (!res.ok) {
    throw new Error(`Buildings request failed: ${res.status} ${res.statusText}`)
  }
  return res.json()
}

export async function fetchTreesNearby(center: LatLon, radiusM = 400): Promise<TreesResponse> {
  const params = new URLSearchParams({
    lat: String(center.lat),
    lon: String(center.lon),
    radius_m: String(radiusM),
  })
  const res = await fetch(`${API_URL}/trees-nearby?${params.toString()}`)
  if (!res.ok) {
    throw new Error(`Trees request failed: ${res.status} ${res.statusText}`)
  }
  return res.json()
}

export async function fetchTransitNearby(): Promise<TransitNearbyResponse> {
  const res = await fetch(`${API_URL}/transit-nearby`)
  if (!res.ok) {
    throw new Error(`Transit request failed: ${res.status} ${res.statusText}`)
  }
  return res.json()
}

export interface GeocodeResult {
  label: string
  point: LatLon
}

// Karlsruhe's bounding box (west, south, east, north), used to bias/limit
// results to the one city this app covers rather than resolving a typed
// street name to some other "Kaiserstraße" halfway across the country.
const KARLSRUHE_VIEWBOX = '8.28,48.95,8.55,49.08'

/**
 * Free-text address/place search, scoped to Karlsruhe. Backed by the public
 * Nominatim (OpenStreetMap) API — there's no geocoding endpoint on our own
 * backend, and Nominatim's usage policy is fine for this: low volume,
 * debounced by the caller, no bulk/automated querying.
 */
export async function geocodeAddress(query: string): Promise<GeocodeResult[]> {
  const trimmed = query.trim()
  if (trimmed.length < 3) return []

  const params = new URLSearchParams({
    q: trimmed,
    format: 'jsonv2',
    limit: '5',
    viewbox: KARLSRUHE_VIEWBOX,
    bounded: '1',
  })
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) {
    throw new Error(`Geocoding request failed: ${res.status} ${res.statusText}`)
  }
  const results: { display_name: string; lat: string; lon: string }[] = await res.json()
  return results.map((r) => ({
    label: r.display_name,
    point: { lat: Number.parseFloat(r.lat), lon: Number.parseFloat(r.lon) },
  }))
}

export function isoAtHour(hour: number): string {
  const now = new Date()
  now.setHours(hour, 0, 0, 0)
  return now.toISOString()
}

export interface WeatherSnapshot {
  temperatureC: number
  cloudCoverPct: number
  precipitationMm: number
  conditionLabel: string
  conditionIcon: string
}

// WMO weather codes, as returned by Open-Meteo's `weather_code` field —
// collapsed to the handful of conditions worth telling a user apart, not
// the full spec. Codes not listed here (rare) fall back to a generic label.
const WMO_CONDITIONS: Record<number, { label: string; icon: string }> = {
  0: { label: 'Clear sky', icon: '☀️' },
  1: { label: 'Mainly clear', icon: '🌤️' },
  2: { label: 'Partly cloudy', icon: '⛅' },
  3: { label: 'Overcast', icon: '☁️' },
  45: { label: 'Fog', icon: '🌫️' },
  48: { label: 'Fog', icon: '🌫️' },
  51: { label: 'Light drizzle', icon: '🌦️' },
  53: { label: 'Drizzle', icon: '🌦️' },
  55: { label: 'Dense drizzle', icon: '🌦️' },
  56: { label: 'Freezing drizzle', icon: '🌦️' },
  57: { label: 'Freezing drizzle', icon: '🌦️' },
  61: { label: 'Light rain', icon: '🌧️' },
  63: { label: 'Rain', icon: '🌧️' },
  65: { label: 'Heavy rain', icon: '🌧️' },
  66: { label: 'Freezing rain', icon: '🌧️' },
  67: { label: 'Freezing rain', icon: '🌧️' },
  71: { label: 'Light snow', icon: '🌨️' },
  73: { label: 'Snow', icon: '🌨️' },
  75: { label: 'Heavy snow', icon: '🌨️' },
  77: { label: 'Snow grains', icon: '🌨️' },
  80: { label: 'Rain showers', icon: '🌦️' },
  81: { label: 'Rain showers', icon: '🌦️' },
  82: { label: 'Violent rain showers', icon: '⛈️' },
  85: { label: 'Snow showers', icon: '🌨️' },
  86: { label: 'Snow showers', icon: '🌨️' },
  95: { label: 'Thunderstorm', icon: '⛈️' },
  96: { label: 'Thunderstorm with hail', icon: '⛈️' },
  99: { label: 'Thunderstorm with hail', icon: '⛈️' },
}

/**
 * Today's real, current weather at `point` — no API key required. Backed by
 * Open-Meteo, a free public weather API with no auth/quota for this kind of
 * low-volume usage. The sun-position math elsewhere in this app (suncalc) is
 * purely geometric and has no idea whether the sky is actually clear or
 * overcast right now; this is what fills that gap.
 */
export async function fetchCurrentWeather(point: LatLon): Promise<WeatherSnapshot> {
  const params = new URLSearchParams({
    latitude: String(point.lat),
    longitude: String(point.lon),
    current: 'temperature_2m,precipitation,weather_code,cloud_cover',
    timezone: 'auto',
  })
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`)
  if (!res.ok) {
    throw new Error(`Weather request failed: ${res.status} ${res.statusText}`)
  }
  const data = await res.json()
  const current = data.current
  const condition = WMO_CONDITIONS[current.weather_code] ?? { label: 'Unknown', icon: '🌡️' }
  return {
    temperatureC: current.temperature_2m,
    cloudCoverPct: current.cloud_cover,
    precipitationMm: current.precipitation,
    conditionLabel: condition.label,
    conditionIcon: condition.icon,
  }
}
