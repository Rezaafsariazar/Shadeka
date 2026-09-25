import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import * as SunCalc from 'suncalc'
import { fetchBuildingsNearby, fetchTransitNearby, type LatLon, type TransitVehicle } from '../lib/api'
import { dateAtMinutes } from '../lib/time'
import { timeStore } from '../lib/timeStore'
import { createBuildingShadowLayer } from '../map/buildingShadowLayer'
import SunIndicator from './SunIndicator'

const KARLSRUHE_CENTER: [number, number] = [8.4037, 49.0069]
const KARLSRUHE_CENTER_LATLON: LatLon = { lat: KARLSRUHE_CENTER[1], lon: KARLSRUHE_CENTER[0] }
const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty'
const ROUTE_SOURCE_ID = 'route'
const ROUTE_LAYER_ID = 'route-line'
const TRANSIT_SOURCE_ID = 'transit'
const TRANSIT_LAYER_ID = 'transit-vehicles'

// /transit-nearby does real TRIAS + PostGIS work per request (no bundled vehicle
// GPS feed for this region — see backend), which in practice takes several
// seconds, not the sub-second timing of the other endpoints. This only refreshes
// *which* vehicles exist and their schedule (e.g. a realtime delay changing) —
// the actual on-screen motion comes from a separate, continuous per-frame loop
// (see the animation effect below) driven by real elapsed time against each
// vehicle's own real departure/arrival times, not from this poll directly, so
// polling much faster than this wouldn't make the motion any smoother.
const TRANSIT_POLL_MS = 20000

type TransitFeatureProperties = { journey_ref: string; mode: string; bearing: number }

const TRANSIT_ICON_TRAM = 'transit-arrow-tram'
const TRANSIT_ICON_RAIL = 'transit-arrow-rail'

// Building shadows only below this zoom would mean fetching most of the city;
// at 15 the view is ~2km across, still a bounded /buildings-nearby request.
const SHADOW_MIN_ZOOM = 15
const SHADOW_FETCH_MIN_RADIUS_M = 300
const SHADOW_FETCH_MAX_RADIUS_M = 900
// Past this many loaded buildings, drop the ones far from the current view.
const SHADOW_MAX_BUILDINGS = 20000
const SHADOW_KEEP_RADIUS_M = 2500

function distanceMeters(a: LatLon, b: LatLon): number {
  const dx = (b.lon - a.lon) * 111320 * Math.cos((a.lat * Math.PI) / 180)
  const dy = (b.lat - a.lat) * 111320
  return Math.hypot(dx, dy)
}

/** A filled triangle pointing straight up (north) at 0 rotation, so icon-rotate
 * (compass degrees clockwise from north) points it in the vehicle's real
 * direction of travel once rotation-alignment is 'map'. */
function createArrowIcon(color: string): ImageData {
  const size = 28
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = color
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 1.5
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(size / 2, 1) // tip, pointing north
  ctx.lineTo(size - 5, size - 3)
  ctx.lineTo(size / 2, size - 9) // slight notch at the back for a clearer arrow shape
  ctx.lineTo(5, size - 3)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  return ctx.getImageData(0, 0, size, size)
}

/** Compass bearing (degrees clockwise from north) from one lng/lat to another —
 * matches MapLibre's icon-rotate convention under rotation-alignment:'map'.
 * Returns null when the two points are ~identical (no reliable heading). */
function computeBearingDeg(from: [number, number], to: [number, number]): number | null {
  const dx = to[0] - from[0]
  const dy = to[1] - from[1]
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return null
  const avgLatRad = ((from[1] + to[1]) / 2 * Math.PI) / 180
  const east = dx * Math.cos(avgLatRad) // scale lon delta by local meters-per-degree ratio
  const rad = Math.atan2(east, dy)
  return ((rad * 180) / Math.PI + 360) % 360
}

/** Cumulative arc length (planar approximation, fine at city scale — same idiom
 * as computeBearingDeg) up to each point in a polyline, so a fractional
 * position can be found by distance travelled rather than by raw point index —
 * real track polylines have very unevenly spaced points, so indexing by a
 * simple point-fraction would speed up/slow down through denser/sparser
 * stretches instead of moving at constant real-world speed. */
function cumulativeLengths(coords: [number, number][]): number[] {
  const lens = [0]
  for (let i = 1; i < coords.length; i++) {
    const [x1, y1] = coords[i - 1]
    const [x2, y2] = coords[i]
    const avgLatRad = ((y1 + y2) / 2 * Math.PI) / 180
    const dx = (x2 - x1) * Math.cos(avgLatRad)
    const dy = y2 - y1
    lens.push(lens[lens.length - 1] + Math.hypot(dx, dy))
  }
  return lens
}

/** Position and local heading at fraction `t` (0-1) along a real track polyline. */
function pointAndBearingAlong(coords: [number, number][], t: number): { coords: [number, number]; bearing: number } {
  if (coords.length < 2) return { coords: coords[0], bearing: 0 }
  const lens = cumulativeLengths(coords)
  const total = lens[lens.length - 1]
  const target = Math.max(0, Math.min(1, t)) * total
  let i = 0
  while (i < lens.length - 2 && lens[i + 1] < target) i++
  const segStart = lens[i]
  const segEnd = lens[i + 1]
  const segT = segEnd > segStart ? (target - segStart) / (segEnd - segStart) : 0
  const [x1, y1] = coords[i]
  const [x2, y2] = coords[i + 1]
  const coord: [number, number] = [x1 + (x2 - x1) * segT, y1 + (y2 - y1) * segT]
  return { coords: coord, bearing: computeBearingDeg([x1, y1], [x2, y2]) ?? 0 }
}

function parseTimeMs(iso: string | null): number | null {
  return iso ? new Date(iso).getTime() : null
}

/** Where a vehicle actually is right now, computed purely from real elapsed
 * time against its own real departure/arrival times — not from any polled
 * snapshot position. `bearing: null` means "dwelling or unknown, keep the
 * last real heading" rather than a fresh one to report. */
function computeVehicleState(vehicle: TransitVehicle, nowMs: number): { coords: [number, number]; bearing: number | null } | null {
  const { calls, segments } = vehicle
  if (calls.length === 0) return null

  for (let i = 0; i < calls.length; i++) {
    const arr = parseTimeMs(calls[i].arrival)
    const dep = parseTimeMs(calls[i].departure)
    // Dwelling at this stop right now (a real scheduled wait) — stationary.
    if (arr !== null && dep !== null && nowMs >= arr && nowMs <= dep) {
      return { coords: [calls[i].lon, calls[i].lat], bearing: null }
    }
    // Moving from this stop toward the next one right now.
    if (i < calls.length - 1) {
      const nextArr = parseTimeMs(calls[i + 1].arrival)
      if (dep !== null && nextArr !== null && nowMs >= dep && nowMs <= nextArr) {
        const total = nextArr - dep
        const t = total > 0 ? (nowMs - dep) / total : 1
        return pointAndBearingAlong(segments[i].coordinates, t)
      }
    }
  }

  // "now" falls outside every window this vehicle's schedule covers — either
  // just before its first departure, or past the last stop we have data for
  // (the next poll will bring a fresher slice of the schedule). Clamp to the
  // nearest known endpoint instead of guessing.
  const firstStart = parseTimeMs(calls[0].departure) ?? parseTimeMs(calls[0].arrival)
  const first = calls[0]
  if (firstStart !== null && nowMs < firstStart) {
    return { coords: [first.lon, first.lat], bearing: null }
  }
  const last = calls[calls.length - 1]
  return { coords: [last.lon, last.lat], bearing: null }
}

interface MapViewProps {
  origin: LatLon | null
  destination: LatLon | null
  route: GeoJSON.LineString | null
  onMapClick: (point: LatLon) => void
}

export default function MapView({ origin, destination, route, onMapClick }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const originMarkerRef = useRef<maplibregl.Marker | null>(null)
  const destMarkerRef = useRef<maplibregl.Marker | null>(null)
  const onMapClickRef = useRef(onMapClick)
  onMapClickRef.current = onMapClick
  // Endpoints of the last route the camera was fitted to. Re-fetching the
  // same origin/destination (time or preference changes) returns a route
  // with the same endpoints and must not yank the camera around again.
  const lastFittedRouteKeyRef = useRef<string | null>(null)
  const [bearing, setBearing] = useState(0)
  const [shadowZoomHint, setShadowZoomHint] = useState(true)

  useEffect(() => {
    if (!containerRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: KARLSRUHE_CENTER,
      zoom: 13,
    })
    mapRef.current = map

    map.addControl(new maplibregl.NavigationControl(), 'top-right')

    map.on('rotate', () => setBearing(map.getBearing()))

    map.on('click', (e: maplibregl.MapMouseEvent) => {
      onMapClickRef.current({ lat: e.lngLat.lat, lon: e.lngLat.lng })
    })

    const shadows = createBuildingShadowLayer(KARLSRUHE_CENTER_LATLON)

    // Shadows follow the shared smoothed time every frame it changes — a
    // uniform update in the layer, no React re-render.
    const applySun = () => {
      const { altitude, azimuth } = SunCalc.getPosition(
        dateAtMinutes(timeStore.getDisplay()),
        KARLSRUHE_CENTER_LATLON.lat,
        KARLSRUHE_CENTER_LATLON.lon,
      )
      shadows.setSun(altitude, azimuth)
    }
    const unsubscribeTime = timeStore.subscribeDisplay(applySun)

    let lastShadowFetch: { center: LatLon; radius: number } | null = null
    let shadowFetchInFlight = false
    let disposed = false
    const loadShadowBuildings = () => {
      if (disposed) return
      const zoomedIn = map.getZoom() >= SHADOW_MIN_ZOOM
      setShadowZoomHint(!zoomedIn)
      if (!zoomedIn || shadowFetchInFlight) return

      const c = map.getCenter()
      const center: LatLon = { lat: c.lat, lon: c.lng }
      const ne = map.getBounds().getNorthEast()
      const halfDiagonal = distanceMeters(center, { lat: ne.lat, lon: ne.lng })
      const radius = Math.min(SHADOW_FETCH_MAX_RADIUS_M, Math.max(SHADOW_FETCH_MIN_RADIUS_M, halfDiagonal + 100))
      if (
        lastShadowFetch &&
        lastShadowFetch.radius >= radius &&
        distanceMeters(lastShadowFetch.center, center) < lastShadowFetch.radius * 0.4
      ) {
        return
      }

      shadowFetchInFlight = true
      fetchBuildingsNearby(center, radius)
        .then((data) => {
          shadowFetchInFlight = false
          if (disposed) return
          lastShadowFetch = { center, radius }
          shadows.addBuildings(data.features)
          if (shadows.size() > SHADOW_MAX_BUILDINGS) shadows.pruneFarFrom(center, SHADOW_KEEP_RADIUS_M)
          // The view may have moved while this was in flight (its moveend
          // was skipped above); catch up now that the request is done.
          loadShadowBuildings()
        })
        .catch((err) => {
          shadowFetchInFlight = false
          console.error('Failed to load buildings for shadows', err)
        })
    }

    map.on('load', () => {
      map.addSource(ROUTE_SOURCE_ID, {
        type: 'geojson',
        lineMetrics: true,
        data: { type: 'FeatureCollection', features: [] },
      })
      map.addLayer({
        id: ROUTE_LAYER_ID,
        type: 'line',
        source: ROUTE_SOURCE_ID,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-width': 5,
          'line-gradient': [
            'interpolate',
            ['linear'],
            ['line-progress'],
            0,
            '#14b8a6',
            1,
            '#fb7185',
          ],
        },
      })

      map.addSource(TRANSIT_SOURCE_ID, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      // Distinct from the teal/coral origin/destination markers: amber for
      // tram, violet for S-Bahn (Karlsruhe's dual-system "Stadtbahn" S-lines run
      // on tram tracks in the city center, but still worth telling apart on the
      // map since they're the ones that go regional).
      map.addImage(TRANSIT_ICON_TRAM, createArrowIcon('#f59e0b'))
      map.addImage(TRANSIT_ICON_RAIL, createArrowIcon('#8b5cf6'))
      map.addLayer({
        id: TRANSIT_LAYER_ID,
        type: 'symbol',
        source: TRANSIT_SOURCE_ID,
        layout: {
          'icon-image': ['match', ['get', 'mode'], 'rail', TRANSIT_ICON_RAIL, TRANSIT_ICON_TRAM],
          // Compass degrees clockwise from north (see computeBearingDeg) — needs
          // 'map' alignment, not the default 'viewport', so the arrow points in
          // the vehicle's real direction of travel even if the user rotates the
          // map, not just whatever's "up" on screen.
          'icon-rotate': ['get', 'bearing'],
          'icon-rotation-alignment': 'map',
          'icon-allow-overlap': true,
          'icon-size': 0.85,
        },
      })

      // Below the base style's buildings (so shadows fall on streets and
      // ground, not roofs) and below the route line.
      const firstBuildingLayer = map.getStyle().layers.find((l) => l.id.toLowerCase().includes('building'))
      map.addLayer(shadows.layer, firstBuildingLayer?.id ?? ROUTE_LAYER_ID)
      applySun()
      loadShadowBuildings()
    })
    map.on('moveend', loadShadowBuildings)

    return () => {
      disposed = true
      unsubscribeTime()
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (origin) {
      if (!originMarkerRef.current) {
        originMarkerRef.current = new maplibregl.Marker({ color: '#14b8a6' })
          .setLngLat([origin.lon, origin.lat])
          .addTo(map)
      } else {
        originMarkerRef.current.setLngLat([origin.lon, origin.lat])
      }
    } else {
      originMarkerRef.current?.remove()
      originMarkerRef.current = null
    }
  }, [origin])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (destination) {
      if (!destMarkerRef.current) {
        destMarkerRef.current = new maplibregl.Marker({ color: '#fb7185' })
          .setLngLat([destination.lon, destination.lat])
          .addTo(map)
      } else {
        destMarkerRef.current.setLngLat([destination.lon, destination.lat])
      }
    } else {
      destMarkerRef.current?.remove()
      destMarkerRef.current = null
    }
  }, [destination])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const applyRoute = () => {
      const source = map.getSource(ROUTE_SOURCE_ID) as maplibregl.GeoJSONSource | undefined
      if (!source) return
      source.setData(
        route
          ? { type: 'Feature', properties: {}, geometry: route }
          : { type: 'FeatureCollection', features: [] },
      )
      if (route) {
        const coords = route.coordinates as [number, number][]
        const first = coords[0]
        const last = coords[coords.length - 1]
        const key = `${first[0].toFixed(5)},${first[1].toFixed(5)}|${last[0].toFixed(5)},${last[1].toFixed(5)}`
        if (key !== lastFittedRouteKeyRef.current) {
          lastFittedRouteKeyRef.current = key
          const bounds = coords.reduce(
            (b, c) => b.extend(c),
            new maplibregl.LngLatBounds(coords[0], coords[0]),
          )
          map.fitBounds(bounds, { padding: 80, maxZoom: 17, duration: 500 })
        }
      }
    }

    if (map.isStyleLoaded()) {
      applyRoute()
    } else {
      map.once('load', applyRoute)
    }
  }, [route])

  // Poll for which tram/S-Bahn vehicles exist and their real remaining
  // schedule (stop times + real track geometry per segment) — this does NOT
  // drive the on-screen position directly. A separate, continuous
  // requestAnimationFrame loop below renders each vehicle's position every
  // frame purely from real elapsed time against its own schedule, so motion
  // is constant between stops and genuinely pauses during a real dwell,
  // instead of easing between two poll snapshots (which reads as a
  // teleport-then-glide every poll, not real continuous movement).
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    let cancelled = false
    let isFetching = false
    let pollTimer: ReturnType<typeof setTimeout>
    let vehicles: TransitVehicle[] = []

    const poll = async () => {
      if (cancelled || isFetching) return
      isFetching = true
      try {
        const data = await fetchTransitNearby()
        if (cancelled) return
        vehicles = data.vehicles
      } catch (err) {
        console.error('Failed to load nearby transit', err)
      } finally {
        isFetching = false
        if (!cancelled) pollTimer = setTimeout(poll, TRANSIT_POLL_MS)
      }
    }
    poll()

    // Persists across frames/polls so a vehicle keeps pointing the way it was
    // last confirmed to be heading while dwelling or between schedule
    // updates, instead of snapping to 0/north (computeVehicleState returns
    // bearing:null in exactly those cases).
    const lastBearings = new Map<string, number>()
    let animFrame = 0

    const renderFrame = () => {
      const source = map.getSource(TRANSIT_SOURCE_ID) as maplibregl.GeoJSONSource | undefined
      if (source) {
        const now = Date.now()
        const features: GeoJSON.Feature<GeoJSON.Point, TransitFeatureProperties>[] = []
        for (const vehicle of vehicles) {
          const state = computeVehicleState(vehicle, now)
          if (!state) continue
          const bearing = state.bearing ?? lastBearings.get(vehicle.journey_ref) ?? 0
          if (state.bearing !== null) lastBearings.set(vehicle.journey_ref, state.bearing)
          features.push({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: state.coords },
            properties: { journey_ref: vehicle.journey_ref, mode: vehicle.mode, bearing },
          })
        }
        source.setData({ type: 'FeatureCollection', features })
      }
      animFrame = requestAnimationFrame(renderFrame)
    }
    animFrame = requestAnimationFrame(renderFrame)

    // Hover tooltip: line/route, origin → destination, trip number, and
    // previous/next stop. All of this is already on each vehicle object from
    // the same poll that drives its position — vehicle.calls[0]/[1] are
    // exactly the previous/next stop regardless of whether it's currently
    // dwelling or moving (see computeVehicleState), so no extra lookup is
    // needed beyond finding the hovered vehicle by journey_ref.
    const popup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 14,
      className: 'transit-tooltip',
    })

    const onMouseMove = (e: maplibregl.MapLayerMouseEvent) => {
      const feature = e.features?.[0]
      const journeyRef = feature?.properties?.journey_ref as string | undefined
      const vehicle = journeyRef ? vehicles.find((v) => v.journey_ref === journeyRef) : undefined
      if (!feature || !vehicle) return

      map.getCanvas().style.cursor = 'pointer'

      const line = vehicle.line_name ? `Line ${vehicle.line_name}` : 'Unknown line'
      const route = `${vehicle.origin_text ?? '?'} → ${vehicle.destination_text ?? '?'}`
      const tripNumber = vehicle.journey_ref.split(':').pop() ?? vehicle.journey_ref
      const prevStop = vehicle.calls[0]?.stop_name ?? '?'
      const nextStop = vehicle.calls[1]?.stop_name ?? '?'
      const stops = `${prevStop} → ${nextStop}`

      const html = `<div style="font:12px/1.5 system-ui,sans-serif;">
        <div style="font-weight:600;">${line}</div>
        <div>${route}</div>
        <div>Trip ${tripNumber}</div>
        <div>${stops}</div>
      </div>`

      popup.setLngLat((feature.geometry as GeoJSON.Point).coordinates as [number, number]).setHTML(html).addTo(map)
    }

    const onMouseLeave = () => {
      map.getCanvas().style.cursor = ''
      popup.remove()
    }

    map.on('mousemove', TRANSIT_LAYER_ID, onMouseMove)
    map.on('mouseleave', TRANSIT_LAYER_ID, onMouseLeave)

    return () => {
      cancelled = true
      clearTimeout(pollTimer)
      cancelAnimationFrame(animFrame)
      map.off('mousemove', TRANSIT_LAYER_ID, onMouseMove)
      map.off('mouseleave', TRANSIT_LAYER_ID, onMouseLeave)
      popup.remove()
    }
  }, [])

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      <div className="absolute left-4 top-4 z-10">
        <SunIndicator bearing={bearing} center={KARLSRUHE_CENTER_LATLON} />
      </div>
      {shadowZoomHint && (
        <div className="pointer-events-none absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-full bg-slate-900/80 px-3 py-1.5 text-xs font-medium text-white shadow-lg backdrop-blur">
          Zoom in to see building shadows
        </div>
      )}
    </div>
  )
}
