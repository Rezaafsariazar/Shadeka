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

export interface WeatherSnapshot {
  temperatureC: number
  cloudCoverPct: number
  precipitationMm: number
  conditionLabel: string
  conditionKind: WeatherKind
}

export type WeatherKind = 'clear' | 'partly' | 'cloudy' | 'fog' | 'rain' | 'snow' | 'storm'

// WMO weather codes, as returned by Open-Meteo's `weather_code` field —
// collapsed to the handful of conditions worth telling a user apart, not
// the full spec. Codes not listed here (rare) fall back to a generic label.
const WMO_CONDITIONS: Record<number, { label: string; kind: WeatherKind }> = {
  0: { label: 'Clear sky', kind: 'clear' },
  1: { label: 'Mainly clear', kind: 'partly' },
  2: { label: 'Partly cloudy', kind: 'partly' },
  3: { label: 'Overcast', kind: 'cloudy' },
  45: { label: 'Fog', kind: 'fog' },
  48: { label: 'Fog', kind: 'fog' },
  51: { label: 'Light drizzle', kind: 'rain' },
  53: { label: 'Drizzle', kind: 'rain' },
  55: { label: 'Dense drizzle', kind: 'rain' },
  56: { label: 'Freezing drizzle', kind: 'rain' },
  57: { label: 'Freezing drizzle', kind: 'rain' },
  61: { label: 'Light rain', kind: 'rain' },
  63: { label: 'Rain', kind: 'rain' },
  65: { label: 'Heavy rain', kind: 'rain' },
  66: { label: 'Freezing rain', kind: 'rain' },
  67: { label: 'Freezing rain', kind: 'rain' },
  71: { label: 'Light snow', kind: 'snow' },
  73: { label: 'Snow', kind: 'snow' },
  75: { label: 'Heavy snow', kind: 'snow' },
  77: { label: 'Snow grains', kind: 'snow' },
  80: { label: 'Rain showers', kind: 'rain' },
  81: { label: 'Rain showers', kind: 'rain' },
  82: { label: 'Violent rain showers', kind: 'storm' },
  85: { label: 'Snow showers', kind: 'snow' },
  86: { label: 'Snow showers', kind: 'snow' },
  95: { label: 'Thunderstorm', kind: 'storm' },
  96: { label: 'Thunderstorm with hail', kind: 'storm' },
  99: { label: 'Thunderstorm with hail', kind: 'storm' },
}

/**
 * Today's real weather forecast at `point`, for whichever hour the app's
 * "Time of day" slider is set to — no API key required. Backed by
 * Open-Meteo, a free public weather API with no auth/quota for this kind of
 * low-volume usage. The sun-position math elsewhere in this app (suncalc) is
 * purely geometric and has no idea whether the sky is actually clear or
 * overcast at that hour; this is what fills that gap. Uses the hourly
 * forecast (not Open-Meteo's "current conditions" endpoint) specifically so
 * this tracks the slider instead of always showing the same right-now
 * reading regardless of what hour is selected.
 */
export async function fetchWeatherAtHour(point: LatLon, hour: number): Promise<WeatherSnapshot> {
  const params = new URLSearchParams({
    latitude: String(point.lat),
    longitude: String(point.lon),
    hourly: 'temperature_2m,precipitation,weather_code,cloud_cover',
    timezone: 'auto',
    forecast_days: '1',
  })
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`)
  if (!res.ok) {
    throw new Error(`Weather request failed: ${res.status} ${res.statusText}`)
  }
  const data = await res.json()
  const times: string[] = data.hourly.time
  // Match by the "HH" substring of each "YYYY-MM-DDTHH:MM" entry rather than
  // parsing with `new Date(...)` — these are naive local-time strings for
  // `point`'s own timezone (thanks to timezone=auto), and the Date
  // constructor would instead interpret them in the browser's own timezone.
  const targetHour = Math.round(hour) % 24
  let index = times.findIndex((t) => Number(t.slice(11, 13)) === targetHour)
  if (index === -1) index = 0

  const condition = WMO_CONDITIONS[data.hourly.weather_code[index]] ?? { label: 'Unknown', kind: 'cloudy' as const }
  return {
    temperatureC: data.hourly.temperature_2m[index],
    cloudCoverPct: data.hourly.cloud_cover[index],
    precipitationMm: data.hourly.precipitation[index],
    conditionLabel: condition.label,
    conditionKind: condition.kind,
  }
}
