export interface LatLon {
  lat: number
  lon: number
}

export type ShadeModel = 'base' | 'advanced'

export interface TemperatureProfilePoint {
  distance_m: number
  air_temp_c: number
  felt_temp_c: number
}

export interface RouteResponse {
  time_bucket: string
  shade_model: ShadeModel
  distance_m: number
  estimated_minutes: number
  shade_pct: number
  geometry: GeoJSON.LineString
  /** null if the live weather fetch failed server-side -- route info itself still works without it. */
  temperature_profile: TemperatureProfilePoint[] | null
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
  shadeModel: ShadeModel = 'base',
): Promise<RouteResponse> {
  const params = new URLSearchParams({
    origin_lat: String(origin.lat),
    origin_lon: String(origin.lon),
    dest_lat: String(destination.lat),
    dest_lon: String(destination.lon),
    shade_pref: String(shadePref),
    at,
    shade_model: shadeModel,
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

export function isoAtHour(hour: number): string {
  const now = new Date()
  now.setHours(hour, 0, 0, 0)
  return now.toISOString()
}
