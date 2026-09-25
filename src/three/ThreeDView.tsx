import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import * as THREE from 'three'
import * as SunCalc from 'suncalc'
import {
  fetchBuildingsNearby,
  fetchTreesNearby,
  isoAtHour,
  type BuildingsResponse,
  type LatLon,
  type TreesResponse,
} from '../lib/api'
import SunIndicator from '../components/SunIndicator'

// threebox-plugin (the usual MapLibre+three.js helper) assumes a `map.transform`
// API that MapLibre GL JS v6's camera/projection refactor removed, so it crashes
// on init. Instead we drive a plain three.js scene ourselves through MapLibre's
// native CustomLayerInterface, using the well-known mercator model-matrix
// technique from MapLibre/Mapbox's "add a 3D model with three.js" recipe.

const KARLSRUHE_CENTER: LatLon = { lat: 49.0069, lon: 8.4037 }
const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty'
const FETCH_RADIUS_M = 400
// MapLibre's `within` filter requires a feature to be *entirely* contained
// to count — a large building straddling the fetch-radius boundary fails
// that test and stays visible in the base style, even though we've also
// drawn our own (differently colored) extrusion for it wherever it pokes
// inside the circle. The two overlap and z-fight, reading as a patch of
// darker/grayer buildings right at the edge. Masking a noticeably larger
// circle than the fetch radius ensures any building that's even partially
// ours is fully swallowed by the mask instead of straddling it.
const BUILDING_MASK_MARGIN_M = 80

type CameraMode = 'fly' | 'walk'

const WALK_SPEED_M_S = 6
const WALK_PITCH = 85
const WALK_PITCH_MIN = 75
const WALK_PITCH_MAX = 89
const LOOK_SENSITIVITY = 0.15

// A scripted camera flythrough along a freshly-computed route, so picking a
// route shows it off immediately instead of leaving the user to find it
// manually. Speed/duration are derived from the route's real length (a short
// route shouldn't take as long as a cross-town one), clamped so neither a
// tiny nor a very long route makes for an awkward clip.
const FLYTHROUGH_TARGET_SPEED_M_S = 14
const FLYTHROUGH_MIN_DURATION_S = 4
const FLYTHROUGH_MAX_DURATION_S = 22
const FLYTHROUGH_PITCH = 58
// Noticeably closer than the initial map zoom (17) — the earlier flythrough
// left zoom untouched, which read as a distant, wide view of the route
// rather than a cinematic, immersive one.
const FLYTHROUGH_ZOOM = 18.3
// Real route polylines are jittery at the scale of individual segments
// (closely-spaced vertices from OSM-derived street geometry, not a smooth
// curve), so a heading computed from the *current* tiny segment whips the
// camera around at every one of those micro-kinks. Looking a fixed distance
// ahead along the path instead — the direction from here to a point 30m up
// the route — averages over that noise and tracks the route's actual
// large-scale shape, the way a real driver looks ahead rather than at the
// pavement directly in front of the car.
const FLYTHROUGH_BEARING_LOOKAHEAD_M = 30
// Per-frame lerp factor (toward the look-ahead heading above) rather than
// snapping the camera bearing directly to it, which would still whip-pan at
// sharp real corners (an actual street intersection, say) even with the
// look-ahead smoothing out per-vertex noise. Low enough, combined with the
// look-ahead, to read as a smooth, gentle turn instead of a dizzying snap.
const FLYTHROUGH_BEARING_SMOOTHING = 0.05

/** Offset a lng/lat by a distance in meters (small-area equirectangular approximation, fine at city scale). */
function offsetLngLat(center: [number, number], dxMeters: number, dyMeters: number): [number, number] {
  const metersPerDegLat = 111320
  const metersPerDegLng = 111320 * Math.cos((center[1] * Math.PI) / 180)
  return [center[0] + dxMeters / metersPerDegLng, center[1] + dyMeters / metersPerDegLat]
}

/** Convert a lng/lat point to local meters (X=east, Y=north) relative to an origin. */
function lngLatToLocalMeters(origin: LatLon, point: GeoJSON.Position): [number, number] {
  const metersPerDegLat = 111320
  const metersPerDegLng = 111320 * Math.cos((origin.lat * Math.PI) / 180)
  return [(point[0] - origin.lon) * metersPerDegLng, (point[1] - origin.lat) * metersPerDegLat]
}

/** A circular GeoJSON polygon around a center point, used to mask the base style's own 3D buildings. */
function buildCirclePolygon(center: LatLon, radiusM: number, steps = 64): GeoJSON.Polygon {
  const coords: GeoJSON.Position[] = []
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * Math.PI * 2
    const [lng, lat] = offsetLngLat([center.lon, center.lat], Math.sin(angle) * radiusM, Math.cos(angle) * radiusM)
    coords.push([lng, lat])
  }
  return { type: 'Polygon', coordinates: [coords] }
}

/** A circle we've loaded real building data for; the base style's own buildings are hidden inside it. */
interface LoadedCircle {
  center: LatLon
  radiusM: number
}

/** Each base fill-extrusion layer's original filter, so re-masking rebuilds from it instead of stacking masks. */
const baseBuildingFilters = new WeakMap<maplibregl.Map, Map<string, unknown>>()

/**
 * Hide the base style's own fill-extrusion (3D building) layers only within
 * the circles we've fetched real building data for, so the rest of the city
 * still shows MapLibre's default 3D buildings. Once our own extrusions cover
 * the same footprints in those circles, drawing both would just z-fight.
 * Called again every time another circle is loaded (buildings now load
 * around wherever the camera roams, not just once at the start), so it always
 * starts from the layer's original filter rather than nesting on the last mask.
 */
function hideBaseBuildingsWithin(map: maplibregl.Map, circles: LoadedCircle[]) {
  let originals = baseBuildingFilters.get(map)
  if (!originals) {
    originals = new Map()
    baseBuildingFilters.set(map, originals)
  }
  const area: GeoJSON.MultiPolygon = {
    type: 'MultiPolygon',
    coordinates: circles.map((c) => buildCirclePolygon(c.center, c.radiusM).coordinates),
  }
  const hideWithin = ['!', ['within', area]]

  for (const styleLayer of map.getStyle()?.layers ?? []) {
    if (styleLayer.type !== 'fill-extrusion') continue
    if (!originals.has(styleLayer.id)) {
      originals.set(styleLayer.id, 'filter' in styleLayer ? styleLayer.filter : undefined)
    }
    const existing = originals.get(styleLayer.id)
    const nextFilter = existing ? ['all', existing, hideWithin] : hideWithin
    map.setFilter(styleLayer.id, nextFilter as Parameters<typeof map.setFilter>[1])
  }
}

/**
 * An unlit flat-colored material that still darkens under real shadow-map
 * shadows — unlike a plain MeshBasicMaterial, which has no lighting/shadow
 * logic in its shader at all (verified against three.js's own
 * meshbasic.glsl.js: no shadowmap_pars_fragment/shadowmask chunks), so a cap
 * built from one simply never shows a shadow landing on it, regardless of
 * castShadow/receiveShadow flags or shadow-camera coverage. This grafts the
 * same shadowmap chunks a lit material gets onto MeshBasicMaterial's shader
 * via onBeforeCompile, so the roof stays exactly the flat base color when
 * unshadowed (no per-normal lighting response, preserving the earlier
 * rooftop-color fix) but still multiplies in a real shadow when one lands on
 * it — e.g. a taller neighbor's cast shadow falling on this roof instead of
 * open ground, which is the common case in a dense block.
 */
function createShadowReceivingFlatMaterial(color: THREE.Color): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({ color })
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <clipping_planes_pars_vertex>', '#include <clipping_planes_pars_vertex>\n#include <shadowmap_pars_vertex>')
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        #include <beginnormal_vertex>
        #include <defaultnormal_vertex>
        #include <shadowmap_vertex>`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <clipping_planes_pars_fragment>',
        `#include <clipping_planes_pars_fragment>
        uniform bool receiveShadow;
        #include <shadowmap_pars_fragment>
        #include <shadowmask_pars_fragment>`,
      )
      .replace(
        'vec3 outgoingLight = reflectedLight.indirectDiffuse;',
        'vec3 outgoingLight = reflectedLight.indirectDiffuse * getShadowMask();',
      )
  }
  return material
}

// A tileable facade texture (light wall + a grid of blue-tinted window
// panes, a handful lit warm-white) generated once on a canvas and shared by
// every building's wall material — reads as an actual building facade
// instead of a plain extruded block, the same "windowed low-poly city" look
// tools like Mapbox's own city visualizations use. Built lazily (not at
// module load) since it needs `document`, unavailable during SSR/tests.
let cachedFacadeTexture: THREE.Texture | null = null
function getBuildingFacadeTexture(): THREE.Texture {
  if (cachedFacadeTexture) return cachedFacadeTexture

  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.fillStyle = '#e6e0d3'
    ctx.fillRect(0, 0, size, size)

    const cols = 4
    const rows = 5
    const cellW = size / cols
    const cellH = size / rows
    const marginX = cellW * 0.16
    const marginY = cellH * 0.2
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * cellW + marginX
        const y = r * cellH + marginY
        const w = cellW - marginX * 2
        const h = cellH - marginY * 2
        const lit = Math.random() < 0.12
        ctx.fillStyle = lit
          ? 'rgba(255, 227, 168, 0.9)'
          : `rgba(${132 + Math.random() * 20}, ${162 + Math.random() * 15}, ${183 + Math.random() * 15}, ${0.6 + Math.random() * 0.25})`
        ctx.fillRect(x, y, w, h)
      }
    }
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.colorSpace = THREE.SRGBColorSpace
  cachedFacadeTexture = texture
  return texture
}

// Real-world size (meters) one tile of the facade texture above should
// cover, so window rows/columns come out roughly floor-height/bay-width
// regardless of a building's actual footprint size, rather than stretching
// a fixed number of tiles across every wall no matter how big it is.
const FACADE_TILE_WIDTH_M = 6
const FACADE_TILE_HEIGHT_M = 3.2

/**
 * ExtrudeGeometry's default side-wall UV generator (WorldUVGenerator, see
 * three.js's own ExtrudeGeometry.js) returns the *raw* local-meters x/y/z
 * coordinates as UVs — not normalized to a 0–1 range per wall or per
 * building. Those coordinates are relative to the scene's fixed model
 * origin, so a building 300m from it gets UVs around 300 already, before
 * any texture .repeat is even applied; multiplying that by a per-building
 * repeat factor (an earlier version of this code tried exactly that) only
 * compounds the problem, tiling the facade texture so densely per wall that
 * it mipmaps down to a single averaged, pattern-less color — indistinguishable
 * from a flat fill. Generating UVs directly in real-world tile units instead
 * (dividing the raw coordinate by the tile size here rather than relying on
 * repeat) fixes that at the source, so the texture's default 1:1 repeat is
 * all that's needed for it to actually tile visibly.
 */
const buildingWallUVGenerator: THREE.ExtrudeGeometryOptions['UVGenerator'] = {
  generateTopUV(_geometry, vertices, indexA, indexB, indexC) {
    const a = new THREE.Vector2(vertices[indexA * 3], vertices[indexA * 3 + 1])
    const b = new THREE.Vector2(vertices[indexB * 3], vertices[indexB * 3 + 1])
    const c = new THREE.Vector2(vertices[indexC * 3], vertices[indexC * 3 + 1])
    return [a, b, c]
  },
  generateSideWallUV(_geometry, vertices, indexA, indexB, indexC, indexD) {
    const ax = vertices[indexA * 3]
    const ay = vertices[indexA * 3 + 1]
    const bx = vertices[indexB * 3]
    const by = vertices[indexB * 3 + 1]
    // Same "pick whichever horizontal axis actually varies along this wall"
    // idea as the default generator — a wall running due north-south would
    // otherwise get a constant (and so useless) x-based u for every vertex.
    const useX = Math.abs(ax - bx) >= Math.abs(ay - by)
    const horizontalOf = (i: number) => vertices[i * 3 + (useX ? 0 : 1)]
    const heightOf = (i: number) => vertices[i * 3 + 2]
    return [indexA, indexB, indexC, indexD].map(
      (i) => new THREE.Vector2(horizontalOf(i) / FACADE_TILE_WIDTH_M, heightOf(i) / FACADE_TILE_HEIGHT_M),
    )
  },
}

/** Extrude one building footprint (a single polygon's rings, already in local meters) to its real height. */
function buildExtrudedBuilding(rings: GeoJSON.Position[][], heightM: number, origin: LatLon): THREE.Mesh | null {
  if (rings.length === 0 || rings[0].length < 3) return null

  const toLocal = (pos: GeoJSON.Position) => {
    const [x, y] = lngLatToLocalMeters(origin, pos)
    return new THREE.Vector2(x, y)
  }

  const outerRing = rings[0].map(toLocal)
  const shape = new THREE.Shape(outerRing)
  for (let i = 1; i < rings.length; i++) {
    if (rings[i].length < 3) continue
    shape.holes.push(new THREE.Path(rings[i].map(toLocal)))
  }

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: heightM,
    bevelEnabled: false,
    UVGenerator: buildingWallUVGenerator,
  })
  // Matches the "liberty" style's own building-3d layer
  // (paint["fill-extrusion-color"] = "hsl(35, 8%, 85%)"), so buildings inside
  // our fetch radius read as the same material as the base map's buildings
  // just outside it, not a visibly different (cooler/grayer) one.
  const baseColor = new THREE.Color().setHSL(35 / 360, 0.08, 0.83 + Math.random() * 0.04)

  // MapLibre's own fill-extrusion layer always paints a roof at the exact
  // flat paint color and only tints the vertical walls by a fixed light — it
  // never shades the roof by its (upward) normal. Our buildings previously
  // lit every face, roof included, with the real sun/ambient — invisible
  // from an angled view, but from directly overhead (all a top-down camera
  // sees) every rooftop in the fetch radius came out visibly darker than the
  // base map's own unlit rooftops just outside it, reading as one uniform
  // dark disc rather than a per-building effect. ExtrudeGeometry always
  // assigns the caps (roof + the invisible underside) to material group 0
  // and the sides to group 1 (see its addGroup calls), so giving the cap its
  // own unlit material fixes that while keeping the walls' real directional
  // shading. It's a shadow-receiving variant (see
  // createShadowReceivingFlatMaterial) rather than a plain MeshBasicMaterial,
  // so a taller neighbor's shadow still shows when it lands on this roof.
  const capMaterial = createShadowReceivingFlatMaterial(baseColor)

  const wallMaterial = new THREE.MeshStandardMaterial({
    color: baseColor,
    map: getBuildingFacadeTexture(),
    // The dim ambient/hemisphere fill that makes ground shadows read clearly
    // (see createSunLight) also means a wall facing away from the sun gets
    // almost no light at all, so it renders as flat neutral gray instead of
    // a shaded tan — reading as a different material/color entirely on any
    // building cluster whose visible walls happen to face away from the sun.
    // A small self-tint keeps a shadowed wall recognizably the same color,
    // just darker, without touching the scene-wide ambient (which would
    // wash out the ground shadows again).
    emissive: baseColor,
    emissiveIntensity: 0.1,
    roughness: 0.85,
    metalness: 0.03,
  })
  const mesh = new THREE.Mesh(geometry, [capMaterial, wallMaterial])
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

// Fallback for buildings the backend has no height for, so they don't leave
// gaps where the base map's own 3D buildings are also masked out.
const DEFAULT_BUILDING_HEIGHT_M = 9

/**
 * Add real building footprints, extruded to their real height_m. Successive
 * fetch circles overlap as the camera moves, so buildings already added
 * (tracked by id in `loadedIds`) are skipped rather than drawn twice.
 */
function addRealBuildings(scene: THREE.Scene, data: BuildingsResponse, origin: LatLon, loadedIds: Set<number>) {
  for (const feature of data.features) {
    const id = feature.properties?.id
    if (id !== undefined) {
      if (loadedIds.has(id)) continue
      loadedIds.add(id)
    }
    const height = feature.properties?.height_m || DEFAULT_BUILDING_HEIGHT_M
    if (height <= 0) continue

    const polygons: GeoJSON.Position[][][] =
      feature.geometry.type === 'Polygon'
        ? [feature.geometry.coordinates]
        : feature.geometry.type === 'MultiPolygon'
          ? feature.geometry.coordinates
          : []

    for (const rings of polygons) {
      const mesh = buildExtrudedBuilding(rings, height, origin)
      if (mesh) scene.add(mesh)
    }
  }
}

// The backend's real tree data is noisy at the extremes (e.g. sub-1m "trees"
// paired with 15m crown radii), which reads as absurdly oversized foliage
// next to buildings. Clamp to a plausible urban-tree range rather than
// trusting outliers literally, while still using the real values otherwise.
// This only affects the rendered mesh size, not the underlying data. The
// height floor is 4m (rather than a more literal ~1-2m) because with the
// fixed 25%-trunk / 75%-canopy split below, that's what yields a ~3m-tall
// canopy at the floor — short/stunted real trees would otherwise render as
// stunted-looking stubs.
const TREE_HEIGHT_MIN_M = 4
const TREE_HEIGHT_MAX_M = 20
const TREE_CROWN_MIN_M = 1.5
const TREE_CROWN_MAX_M = 6

// Trees are city-wide (~130k total), so instead of one fetch we keep a
// window of them loaded around wherever the camera currently is:
//  - re-fetch once the map center has moved TREE_REFETCH_MOVE_M since the
//    last fetch (avoids re-querying on every tiny pan)
//  - request everything within TREE_LOAD_RADIUS_M of that center
//  - drop any previously-loaded tree once it's more than
//    TREE_UNLOAD_RADIUS_M away, so the live tree count stays bounded no
//    matter how far the camera roams — the gap between load/unload radius
//    avoids load/unload thrashing right at the boundary
//  - trees within TREE_LOD_NEAR_M of the fetch center get full detail (trunk
//    + smooth canopy, both shadow-casting and -receiving); farther ones get
//    a single low-poly canopy sphere with no trunk and no shadow-receiving,
//    but it still casts a shadow — measured ~1.4ms/frame added render cost
//    for ~1800 shadow casters in a dense area, well within budget, so every
//    visible tree contributes a real shadow instead of only the near ~150m
const TREE_LOAD_RADIUS_M = 500
const TREE_UNLOAD_RADIUS_M = 900
const TREE_REFETCH_MOVE_M = 150
const TREE_LOD_NEAR_M = 150
const TREE_MOVE_THROTTLE_MS = 800

// Buildings re-fetch once the camera has moved this far from the last fetch
// center (each fetch covers FETCH_RADIUS_M around it, so 200m leaves a wide
// overlap and no gap). Loaded buildings are kept, not unloaded, so this caps
// the total to bound draw calls/memory on very long flights — past it, new
// areas just stay on the base map's own buildings.
const BUILDING_REFETCH_MOVE_M = 200
const MAX_LOADED_BUILDINGS = 12000

/** Straight-line distance in meters between two lng/lat points (equirectangular approximation, fine at city scale). */
function distanceMeters(a: LatLon, b: LatLon): number {
  const metersPerDegLat = 111320
  const metersPerDegLng = 111320 * Math.cos((a.lat * Math.PI) / 180)
  const dx = (b.lon - a.lon) * metersPerDegLng
  const dy = (b.lat - a.lat) * metersPerDegLat
  return Math.sqrt(dx * dx + dy * dy)
}

/** A route's coordinates pre-converted to local meters, with cumulative distance along it, for walking it at a constant pace. */
interface RoutePathTable {
  localPts: [number, number][]
  cumulative: number[]
  total: number
}

function buildRoutePathTable(coords: GeoJSON.Position[], origin: LatLon): RoutePathTable {
  const localPts = coords.map((pos) => lngLatToLocalMeters(origin, pos))
  const cumulative = [0]
  for (let i = 1; i < localPts.length; i++) {
    const [x0, y0] = localPts[i - 1]
    const [x1, y1] = localPts[i]
    cumulative.push(cumulative[i - 1] + Math.hypot(x1 - x0, y1 - y0))
  }
  return { localPts, cumulative, total: cumulative[cumulative.length - 1] ?? 0 }
}

/** The local-meters point and direction-of-travel bearing (compass degrees) at `distance` along a route's path table. */
function pointAndBearingAtDistance(table: RoutePathTable, distance: number): { xy: [number, number]; bearingDeg: number } {
  const { localPts, cumulative, total } = table
  const d = Math.min(Math.max(distance, 0), total)
  let i = 1
  while (i < cumulative.length - 1 && cumulative[i] < d) i++
  const [x0, y0] = localPts[i - 1]
  const [x1, y1] = localPts[i]
  const segLen = cumulative[i] - cumulative[i - 1] || 1
  const t = (d - cumulative[i - 1]) / segLen
  const x = x0 + (x1 - x0) * t
  const y = y0 + (y1 - y0) * t
  // atan2(dx, dy) rather than atan2(dy, dx) — matches this file's other
  // compass-bearing conversions (see getSunDirection), where 0=north/90=east.
  const bearingDeg = (Math.atan2(x1 - x0, y1 - y0) * 180) / Math.PI
  return { xy: [x, y], bearingDeg: (bearingDeg + 360) % 360 }
}

/**
 * The camera-facing heading (compass degrees) at `distance` along the route,
 * looking `lookaheadM` further up the path rather than at the immediate
 * next vertex — see FLYTHROUGH_BEARING_LOOKAHEAD_M's comment on why. Returns
 * null within `lookaheadM` of the route's end, where the look-ahead point
 * clamps to the same spot as the current one (zero-length direction vector) —
 * callers should just keep whatever heading they already had.
 */
function lookaheadBearingAtDistance(table: RoutePathTable, distance: number, lookaheadM: number): number | null {
  const [x0, y0] = pointAndBearingAtDistance(table, distance).xy
  const [x1, y1] = pointAndBearingAtDistance(table, Math.min(distance + lookaheadM, table.total)).xy
  const dx = x1 - x0
  const dy = y1 - y0
  if (Math.hypot(dx, dy) < 0.5) return null
  return ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360
}

/** Ease toward `target` bearing by fraction `t` of the shorter way around the compass, so a near-180° turn doesn't spin the long way. */
function lerpBearing(current: number, target: number, t: number): number {
  const diff = ((target - current + 540) % 360) - 180
  return (current + diff * t + 360) % 360
}

function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
}

/**
 * Build one tree's group at its real position/height_m/crown_radius_m.
 * `highDetail` trees (near the camera) get a trunk + a smooth sphere canopy
 * that both casts and receives shadows; distant trees get just a single
 * low-poly canopy sphere (no trunk, doesn't receive shadows), but it still
 * casts one, so every visible tree contributes real shade regardless of LOD.
 */
function buildTreeGroup(feature: TreesResponse['features'][number], origin: LatLon, highDetail: boolean): THREE.Group | null {
  const rawHeight = feature.properties?.height_m
  const rawCrown = feature.properties?.crown_radius_m
  if (!rawHeight || rawHeight <= 0 || !rawCrown || rawCrown <= 0) return null

  const totalHeight = Math.min(Math.max(rawHeight, TREE_HEIGHT_MIN_M), TREE_HEIGHT_MAX_M)
  const crownRadius = Math.min(Math.max(rawCrown, TREE_CROWN_MIN_M), TREE_CROWN_MAX_M)

  const trunkHeight = Math.max(0.5, totalHeight * 0.25)
  const rawCanopyHeight = Math.max(0.5, totalHeight - trunkHeight)
  // The backend's height_m and crown_radius_m aren't reliably paired (a
  // clamped-short tree can still carry a wide crown_radius_m), which can
  // otherwise squash the canopy into a near-flat "pancake" — barely visible
  // face-on, but a thin sliver/crescent when viewed close to edge-on, which
  // is exactly the camera angle walk mode uses. Floor the vertical radius
  // relative to the horizontal one so the canopy always stays roundish.
  const canopyVerticalRadius = Math.max(rawCanopyHeight / 2, crownRadius * 0.75)

  const group = new THREE.Group()

  if (highDetail) {
    const trunkRadius = Math.max(0.12, crownRadius * 0.08)
    const trunkGeometry = new THREE.CylinderGeometry(trunkRadius, trunkRadius, trunkHeight, 8)
    trunkGeometry.rotateX(Math.PI / 2)
    trunkGeometry.translate(0, 0, trunkHeight / 2)
    const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x6b4a34, roughness: 1 })
    const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial)
    trunk.castShadow = true
    trunk.receiveShadow = true
    group.add(trunk)
  }

  // A squashed sphere reads as a rounded foliage volume far better than a
  // sharp cone, which flattens into a triangle silhouette from most angles.
  const canopyGeometry = highDetail ? new THREE.SphereGeometry(1, 16, 12) : new THREE.SphereGeometry(1, 6, 4)
  canopyGeometry.scale(crownRadius, canopyVerticalRadius, crownRadius)
  canopyGeometry.rotateX(Math.PI / 2)
  canopyGeometry.translate(0, 0, trunkHeight + canopyVerticalRadius)
  const canopyMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color().setHSL(0.32, 0.5, 0.3 + Math.random() * 0.15),
    roughness: 1,
  })
  const canopy = new THREE.Mesh(canopyGeometry, canopyMaterial)
  canopy.castShadow = true
  canopy.receiveShadow = highDetail
  group.add(canopy)

  const [x, y] = lngLatToLocalMeters(origin, feature.geometry.coordinates)
  group.position.set(x, y, 0)
  return group
}

// The shadow-catching ground must reach wherever buildings/trees end up loaded
// as the camera roams, not just the start point — a plane sized to the initial
// fetch circle silently stopped showing any ground shadow past it. It's one
// transparent quad (ShadowMaterial), so a big one costs nothing.
const GROUND_PLANE_SIZE_M = 20000

/** Flat ground plane so buildings/trees have a shadow-receiving surface. */
function addGroundPlane(scene: THREE.Scene, size: number) {
  const geometry = new THREE.PlaneGeometry(size, size)
  // ShadowMaterial is fully transparent except where a shadow lands, so the
  // real basemap (roads, parks, sidewalks — already rendered by MapLibre
  // beneath our layer) shows through everywhere else instead of being
  // replaced by one flat color. It still needs receiveShadow to work as a
  // shadow-catching surface for buildings/trees.
  const material = new THREE.ShadowMaterial({ opacity: 0.55 })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.receiveShadow = true
  scene.add(mesh)
}

// Above typical street-furniture height (signs, bollards, parked-car roofs)
// so it doesn't disappear behind them, but still well below any real
// building — only genuinely taller/nearer buildings should occlude it.
const ROUTE_HEIGHT_M = 2.2
const ROUTE_RADIUS_M = 1.1

/**
 * A curve that interpolates *exactly* through the given points via straight
 * segments. CatmullRomCurve3 (the usual choice for a "smooth" tube) fits a
 * spline that can overshoot past the actual points at sharp corners — for a
 * route that hugs building corners at intersections, that bulge can push the
 * tube geometrically into the corner it's rounding, reading as "going behind
 * a building it shouldn't." A polyline can't overshoot: it never leaves the
 * straight line between two consecutive real route points.
 */
class PolylineCurve3 extends THREE.Curve<THREE.Vector3> {
  points: THREE.Vector3[]
  constructor(points: THREE.Vector3[]) {
    super()
    this.points = points
  }
  getPoint(t: number, target: THREE.Vector3 = new THREE.Vector3()) {
    const segmentCount = this.points.length - 1
    const scaled = t * segmentCount
    const i = Math.min(Math.floor(scaled), segmentCount - 1)
    const localT = scaled - i
    return target.copy(this.points[i]).lerp(this.points[i + 1], localT)
  }
}

/** Build the computed route as a raised tube so it doesn't z-fight with the ground/buildings. */
function buildRouteMesh(geometry: GeoJSON.LineString, origin: LatLon): THREE.Mesh | null {
  const points = geometry.coordinates.map((pos) => {
    const [x, y] = lngLatToLocalMeters(origin, pos)
    return new THREE.Vector3(x, y, ROUTE_HEIGHT_M)
  })
  if (points.length < 2) return null

  const curve = new PolylineCurve3(points)
  const tubeSegments = Math.max(8, points.length * 2)
  const tubeGeometry = new THREE.TubeGeometry(curve, tubeSegments, ROUTE_RADIUS_M, 8, false)
  // Unlit so the route reads as a clear UI indicator regardless of time of day/shadow.
  // Depth-testing against real geometry still hid it behind nearby buildings
  // whenever the street it runs along is narrower than those buildings are
  // tall (any fixed ROUTE_HEIGHT_M loses that line-of-sight test at a low or
  // grazing camera angle) — raising the height or fixing curve overshoot
  // can't solve a case that's genuinely, correctly occluded in 3D space. As
  // a wayfinding overlay it should always read on top, like the 2D route
  // line does, so depth-testing is disabled and it's drawn last instead.
  const material = new THREE.MeshBasicMaterial({ color: 0x2dd4bf, depthTest: false })
  const mesh = new THREE.Mesh(tubeGeometry, material)
  mesh.renderOrder = 999
  return mesh
}

// Proportioned after maplibre-gl's own default 2D Marker icon (a 27x41 pin —
// roughly a 3:1 height-to-head-radius ratio: a big rounded head over a short
// tapered tail), scaled well up so the same silhouette still reads clearly
// as a landmark over rooftops from a distance, not just close-up.
const MARKER_TOTAL_HEIGHT_M = 24
const MARKER_HEAD_RADIUS_M = 7

/**
 * A teardrop/pin marker — a cone tapering to a point at the ground, capped
 * with a rounded head — echoing the same silhouette as the 2D map's own pin
 * icon, so origin/destination read as "the same marker" in both views, just
 * scaled up (well above typical building height) so it still peeks over
 * rooftops as a landmark from both free-fly (seen from above) and walk mode
 * (seen from street level). Unlit so it reads clearly as a UI marker
 * regardless of time of day/shadow, same reasoning as the route tube.
 *
 * Depth-testing against real geometry is disabled for the same reason it's
 * disabled on the route tube (see buildRouteMesh): a marker can end up
 * behind a building from the camera's current angle even though it's the
 * taller of the two (a tall building's roofline between the camera and a
 * marker on the far side of it, say) — geometrically correct occlusion, but
 * wrong for a wayfinding pin, which should always read on top like the 2D
 * map's own marker icon does. renderOrder is one past the route tube's own
 * (999) so a marker sitting right at a route endpoint draws in front of it.
 */
function buildPinMarker(color: number): THREE.Group {
  const group = new THREE.Group()
  const material = new THREE.MeshBasicMaterial({ color, depthTest: false })

  const coneHeight = MARKER_TOTAL_HEIGHT_M - MARKER_HEAD_RADIUS_M
  // CylinderGeometry(radiusTop, radiusBottom, ...): after the rotateX/translate
  // idiom used throughout this file, radiusBottom ends up at z=0 (the ground
  // point) and radiusTop ends up at z=coneHeight — so radiusBottom=0 puts the
  // tapered point exactly on the ground, widening up to meet the head.
  const coneGeometry = new THREE.CylinderGeometry(MARKER_HEAD_RADIUS_M, 0, coneHeight, 20)
  coneGeometry.rotateX(Math.PI / 2)
  coneGeometry.translate(0, 0, coneHeight / 2)
  const cone = new THREE.Mesh(coneGeometry, material)
  cone.renderOrder = 1000
  group.add(cone)

  const headGeometry = new THREE.SphereGeometry(MARKER_HEAD_RADIUS_M, 20, 16)
  headGeometry.translate(0, 0, coneHeight)
  const head = new THREE.Mesh(headGeometry, material)
  head.renderOrder = 1000
  group.add(head)

  return group
}

function positionMarker(marker: THREE.Group, point: LatLon, origin: LatLon) {
  const [x, y] = lngLatToLocalMeters(origin, [point.lon, point.lat])
  marker.position.set(x, y, 0)
}

// Both buildings (up to FETCH_RADIUS_M) and trees (up to TREE_LOAD_RADIUS_M)
// load around wherever the camera currently is, so the shadow frustum needs
// to cover the larger of the two circles or the outer ones silently get no
// shadow. It starts centered on the model origin and the `moveend` handler
// re-centers it on the camera as it roams (same fixed size, so shadow-map
// resolution doesn't degrade the farther the camera gets from the start).
const SHADOW_FRUSTUM_M = Math.max(FETCH_RADIUS_M, TREE_LOAD_RADIUS_M) + 50

// How far from its target the shadow-casting light sits, along the sun's
// direction. This needs to grow whenever the frustum (see SHADOW_FRUSTUM_M
// above) grows, or a point on the far side of a widened frustum — a tall
// building diametrically opposite the light, say — can end up with negative
// depth in the shadow camera's view (i.e. behind it, past its near plane)
// instead of just being far away: depth of a point X from a light at
// `target + dir*distance` is `distance - dot(X - target, dir)`, so the worst
// case (X at the frustum's edge, in the direction dir points, elevated by a
// building's height) needs `distance` comfortably bigger than
// `radius*cos(altitude) + maxHeight*sin(altitude)` to stay positive — sizing
// it to `radius` itself is a generous, simple bound since cos/sin never
// exceed 1. See the `moveend` handler for where this actually gets resized.
const SUN_LIGHT_DISTANCE_MIN_M = 300

/** Unit vector pointing from the scene origin toward the sun at `date`/`coords`. */
function getSunDirection(date: Date, coords: LatLon): THREE.Vector3 {
  // This suncalc version (verified directly against its README, not the
  // classic suncalc.js API some docs online describe) returns both altitude
  // and azimuth in *degrees*, with azimuth already compass-convention
  // (clockwise from north: 0=N, 90=E, 180=S, 270=W) — no radians conversion
  // or south-to-north offset needed, unlike what earlier code here assumed.
  const { altitude, azimuth } = SunCalc.getPosition(date, coords.lat, coords.lon)
  const altitudeRad = (altitude * Math.PI) / 180
  const azimuthRad = (azimuth * Math.PI) / 180
  const horizontal = Math.cos(altitudeRad)
  return new THREE.Vector3(Math.sin(azimuthRad) * horizontal, Math.cos(azimuthRad) * horizontal, Math.sin(altitudeRad))
}

/** Sun-driven directional light + shadow setup, positioned via suncalc. */
function createSunLight(): { light: THREE.DirectionalLight; hemi: THREE.HemisphereLight } {
  const light = new THREE.DirectionalLight(0xffffff, 1)
  light.castShadow = true
  light.shadow.mapSize.set(4096, 4096)
  light.shadow.camera.left = -SHADOW_FRUSTUM_M
  light.shadow.camera.right = SHADOW_FRUSTUM_M
  light.shadow.camera.top = SHADOW_FRUSTUM_M
  light.shadow.camera.bottom = -SHADOW_FRUSTUM_M
  light.shadow.camera.near = 1
  light.shadow.camera.far = SUN_LIGHT_DISTANCE_MIN_M + SHADOW_FRUSTUM_M + 100
  // A tiny depth bias avoids acne on large flat faces (roofs, ground); a
  // larger normalBias offsets the sample point along the surface normal,
  // which is more robust against acne on angled walls without the
  // "peter-panning" a bigger depth bias alone would cause.
  light.shadow.bias = -0.0003
  light.shadow.normalBias = 0.4
  // With PCFSoftShadowMap (see renderer.shadowMap.type below), radius sets
  // the softening blur in shadow-map texels. Kept modest relative to the
  // higher map resolution above so edges read as "soft" without dissolving
  // into a barely-visible haze.
  light.shadow.radius = 1.5
  // OrthographicCamera's left/right/top/bottom/near/far are plain
  // properties — three.js only rebuilds the actual projection matrix used
  // at render time when updateProjectionMatrix() is called. Without this,
  // the shadow camera silently keeps DirectionalLightShadow's constructor
  // default frustum (a ±5m box, near 0.5/far 500) no matter what the lines
  // above set it to, so only geometry within a few meters of the light's
  // target would ever land inside the shadow map — every farther building
  // and tree would render with no shadow at all.
  light.shadow.camera.updateProjectionMatrix()

  // HemisphereLight blends sky/ground color by the angle between a surface
  // normal and the light's position vector, so it needs a non-zero position
  // pointing "up" in our scene's convention (Z-up) to actually contribute.
  // Kept fairly dim relative to the directional light below — a strong
  // ambient/hemisphere fill lights shadowed areas almost as brightly as lit
  // ones, which is exactly what makes shadows read as flat/faint.
  const hemi = new THREE.HemisphereLight(0xffffff, 0x3a3a2e, 0.35)
  hemi.position.set(0, 0, 1)

  return { light, hemi }
}

/**
 * Point the directional light at `targetXY` (local meters from the fixed
 * model origin), `distance` away from it along the sun's current direction.
 * `targetXY`/`distance` should track wherever content is actually
 * loaded/visible right now — see `SHADOW_FRUSTUM_M`'s and
 * `SUN_LIGHT_DISTANCE_MIN_M`'s comments on why a shadow camera fixed at the
 * scene origin, at a fixed distance, forever leaves the shadow camera
 * covering a spot (and depth range) the camera may have long since flown
 * away from.
 */
function updateSunLight(light: THREE.DirectionalLight, date: Date, coords: LatLon, targetXY: [number, number], distance: number) {
  const dir = getSunDirection(date, coords)
  const [tx, ty] = targetXY
  light.position.set(tx + dir.x * distance, ty + dir.y * distance, dir.z * distance)
  light.target.position.set(tx, ty, 0)
  // A stronger direct-light multiplier (paired with the dimmer ambient/hemi
  // fill above) keeps lit surfaces clearly brighter than shadowed ones, so
  // shadows read as real contrast rather than a faint tint.
  light.intensity = Math.max(dir.z, 0) * 1.8
}

// Deliberately much farther than the light's own shadow-frustum-relative
// position above — this one is purely visual (where the sun sphere appears
// to sit), independent of the technical distance used for shadow mapping.
const SUN_MARKER_DISTANCE_M = 3000
const SUN_MARKER_RADIUS_M = 90

/** A small radial-gradient sprite for a soft glow/haze around the visible sun. */
function createSunGlowTexture(): THREE.Texture {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (ctx) {
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    gradient.addColorStop(0, 'rgba(255,246,214,0.95)')
    gradient.addColorStop(0.25, 'rgba(255,232,150,0.55)')
    gradient.addColorStop(1, 'rgba(255,220,120,0)')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, size, size)
  }
  return new THREE.CanvasTexture(canvas)
}

/** A visible sun marker: a bright core sphere plus a soft additive glow halo, both unlit. */
function createSunMarker(): THREE.Group {
  const group = new THREE.Group()

  const core = new THREE.Mesh(
    new THREE.SphereGeometry(SUN_MARKER_RADIUS_M, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xfff4d6 }),
  )
  group.add(core)

  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: createSunGlowTexture(),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  )
  glow.scale.setScalar(SUN_MARKER_RADIUS_M * 9)
  group.add(glow)

  return group
}

/** Move the visible sun marker to the sun's current real position; hide it once the sun is below the horizon. */
function positionSunMarker(marker: THREE.Group, date: Date, coords: LatLon) {
  const dir = getSunDirection(date, coords)
  marker.position.copy(dir).multiplyScalar(SUN_MARKER_DISTANCE_M)
  marker.visible = dir.z > -0.02
}

interface ThreeDViewProps {
  timeHour: number
  origin: LatLon | null
  destination: LatLon | null
  route: GeoJSON.LineString | null
  onMapClick: (point: LatLon) => void
}

export default function ThreeDView({ timeHour, origin, destination, route, onMapClick }: ThreeDViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  // Read through a ref (rather than closing over the prop directly) inside
  // the map's 'click' listener below, which is attached once in the
  // mount-only effect and would otherwise keep calling a stale first-render
  // version of onMapClick forever — same pattern MapView.tsx uses.
  const onMapClickRef = useRef(onMapClick)
  onMapClickRef.current = onMapClick
  const sunLightRef = useRef<THREE.DirectionalLight | null>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const fetchCenterRef = useRef<LatLon>(KARLSRUHE_CENTER)
  const routeRef = useRef<GeoJSON.LineString | null>(null)
  const routeMeshRef = useRef<THREE.Mesh | null>(null)
  const loadedTreesRef = useRef<Map<string, { group: THREE.Group; position: LatLon; highDetail: boolean }>>(new Map())
  const lastTreeFetchCenterRef = useRef<LatLon | null>(null)
  // Buildings load around the camera the same way trees do (rather than once
  // around the start point) — otherwise everything past FETCH_RADIUS_M of the
  // route's origin stays MapLibre's own flat-lit base buildings, which cast no
  // shadow in this scene. Ids dedupe the overlap between successive circles.
  const loadedBuildingIdsRef = useRef<Set<number>>(new Set())
  const buildingCirclesRef = useRef<LoadedCircle[]>([])
  const lastBuildingFetchCenterRef = useRef<LatLon | null>(null)
  const buildingFetchInFlightRef = useRef(false)
  const sunMarkerRef = useRef<THREE.Group | null>(null)
  const animatedHourRef = useRef(timeHour)
  const sunAnimFrameRef = useRef(0)
  // Local-meters point (relative to the fixed model origin) the shadow
  // camera is currently centered on — starts at the origin itself, then
  // re-centers on the live camera position as it roams (see the `moveend`
  // handler), so the frustum keeps covering wherever trees are actually
  // loaded instead of staying pinned to the start point forever.
  const sunTargetRef = useRef<[number, number]>([0, 0])
  // How far the light sits from sunTargetRef.current — grows alongside the
  // shadow frustum (see SUN_LIGHT_DISTANCE_MIN_M's comment) so widening the
  // frustum can't push far-side geometry to negative depth.
  const sunDistanceRef = useRef(SUN_LIGHT_DISTANCE_MIN_M)
  const originMarkerRef = useRef<THREE.Group | null>(null)
  const destMarkerRef = useRef<THREE.Group | null>(null)
  const originPropRef = useRef<LatLon | null>(null)
  const destPropRef = useRef<LatLon | null>(null)
  const [cameraMode, setCameraMode] = useState<CameraMode>('fly')
  const [bearing, setBearing] = useState(0)
  const [flythroughActive, setFlythroughActive] = useState(false)
  // Mirrors flythroughActive for the map's 'click' listener, which is
  // attached once in the mount-only effect and needs a live read rather
  // than the value from whatever render it was attached in.
  const flythroughActiveRef = useRef(false)
  flythroughActiveRef.current = flythroughActive
  const flythroughRafRef = useRef(0)
  // Tracks which origin/destination pair the last flythrough already played
  // for, so re-fetching the same route (e.g. dragging the shade-preference
  // or time-of-day slider) doesn't replay it — only a genuinely new pick does.
  const flythroughKeyRef = useRef<string | null>(null)
  routeRef.current = route
  originPropRef.current = origin
  destPropRef.current = destination

  // Show/hide/reposition the origin and destination pin markers to match
  // the current props. Safe to call before the scene exists, and safe to
  // call from the onAdd closure below (which only runs once, asynchronously,
  // so it can't see later prop updates directly) because it reads through
  // the refs above rather than closing over `origin`/`destination` directly.
  function syncMarkers() {
    const scene = sceneRef.current
    if (!scene) return
    const modelOrigin = fetchCenterRef.current

    if (originPropRef.current) {
      if (!originMarkerRef.current) {
        originMarkerRef.current = buildPinMarker(0x14b8a6)
        scene.add(originMarkerRef.current)
      }
      positionMarker(originMarkerRef.current, originPropRef.current, modelOrigin)
      originMarkerRef.current.visible = true
    } else if (originMarkerRef.current) {
      originMarkerRef.current.visible = false
    }

    if (destPropRef.current) {
      if (!destMarkerRef.current) {
        destMarkerRef.current = buildPinMarker(0xfb7185)
        scene.add(destMarkerRef.current)
      }
      positionMarker(destMarkerRef.current, destPropRef.current, modelOrigin)
      destMarkerRef.current.visible = true
    } else if (destMarkerRef.current) {
      destMarkerRef.current.visible = false
    }

    mapRef.current?.triggerRepaint()
  }

  // Smoothly animate the sun (light + visible marker) from wherever it
  // currently is to the position for `targetHour`, instead of snapping
  // instantly — so dragging the time slider reads as the sun actually
  // moving across the sky, with shadows sweeping continuously, rather than
  // jump-cutting between positions.
  function animateSunTo(targetHour: number, coords: LatLon) {
    const light = sunLightRef.current
    if (!light) {
      animatedHourRef.current = targetHour
      return
    }

    cancelAnimationFrame(sunAnimFrameRef.current)
    const fromHour = animatedHourRef.current
    const toHour = targetHour
    const startTime = performance.now()
    const duration = Math.min(1200, Math.max(300, Math.abs(toHour - fromHour) * 500))

    const step = (now: number) => {
      const t = Math.min(1, (now - startTime) / duration)
      const hour = fromHour + (toHour - fromHour) * t
      const date = new Date(isoAtHour(hour))
      updateSunLight(light, date, coords, sunTargetRef.current, sunDistanceRef.current)
      if (sunMarkerRef.current) positionSunMarker(sunMarkerRef.current, date, coords)
      mapRef.current?.triggerRepaint()

      if (t < 1) {
        sunAnimFrameRef.current = requestAnimationFrame(step)
      } else {
        animatedHourRef.current = toHour
      }
    }
    sunAnimFrameRef.current = requestAnimationFrame(step)
  }

  // Fetch real buildings around `center` (skipping if the camera hasn't moved
  // far enough since the last fetch), add any not already in the scene, and
  // extend the base-map mask to cover the new circle. `origin` is the fixed
  // model origin every mesh's position is relative to, as in refreshTreesNear.
  function loadBuildingsNear(scene: THREE.Scene, map: maplibregl.Map, center: LatLon, origin: LatLon) {
    if (buildingFetchInFlightRef.current) return
    if (loadedBuildingIdsRef.current.size >= MAX_LOADED_BUILDINGS) return
    const last = lastBuildingFetchCenterRef.current
    if (last && distanceMeters(last, center) < BUILDING_REFETCH_MOVE_M) return

    buildingFetchInFlightRef.current = true
    lastBuildingFetchCenterRef.current = center

    fetchBuildingsNearby(center, FETCH_RADIUS_M)
      .then((buildings) => {
        if (sceneRef.current !== scene) return // layer/scene was torn down while this was in flight
        addRealBuildings(scene, buildings, origin, loadedBuildingIdsRef.current)
        // Only mask the base style's own 3D buildings once ours have loaded,
        // so a failed fetch still leaves the default city intact.
        buildingCirclesRef.current.push({ center, radiusM: FETCH_RADIUS_M + BUILDING_MASK_MARGIN_M })
        hideBaseBuildingsWithin(map, buildingCirclesRef.current)
        map.triggerRepaint()
      })
      .catch((err: Error) => {
        // Allow the next moveend to retry this area instead of leaving a hole.
        lastBuildingFetchCenterRef.current = last
        console.error('Failed to load real building data', err)
      })
      .finally(() => {
        buildingFetchInFlightRef.current = false
      })
  }

  // Fetch trees around `center` (skipping if we haven't moved far enough
  // since the last fetch), add any not already loaded, and drop any loaded
  // tree that's now too far away. `center` drives what to fetch and the
  // near/far LOD split; `origin` is the fixed model origin every mesh's
  // position is expressed relative to (must stay the same one used by the
  // render-time projection matrix, regardless of where the camera roams).
  function refreshTreesNear(scene: THREE.Scene, center: LatLon, origin: LatLon) {
    const loaded = loadedTreesRef.current

    for (const [key, entry] of loaded) {
      if (distanceMeters(center, entry.position) > TREE_UNLOAD_RADIUS_M) {
        scene.remove(entry.group)
        entry.group.traverse((obj) => {
          if (obj instanceof THREE.Mesh) {
            obj.geometry.dispose()
            ;(obj.material as THREE.Material).dispose()
          }
        })
        loaded.delete(key)
      }
    }

    const last = lastTreeFetchCenterRef.current
    if (last && distanceMeters(last, center) < TREE_REFETCH_MOVE_M) return
    lastTreeFetchCenterRef.current = center

    fetchTreesNearby(center, TREE_LOAD_RADIUS_M)
      .then((trees) => {
        if (sceneRef.current !== scene) return // layer/scene was torn down while this was in flight
        for (const feature of trees.features) {
          const [lng, lat] = feature.geometry.coordinates
          const position: LatLon = { lat, lon: lng }
          const key = `${lng.toFixed(6)},${lat.toFixed(6)}`
          if (loaded.has(key)) continue

          const highDetail = distanceMeters(center, position) <= TREE_LOD_NEAR_M
          const group = buildTreeGroup(feature, origin, highDetail)
          if (!group) continue
          scene.add(group)
          loaded.set(key, { group, position, highDetail })
        }
        mapRef.current?.triggerRepaint()
      })
      .catch((err: Error) => {
        console.error('Failed to load nearby trees', err)
      })
  }

  // Add/replace/remove the route mesh in the live scene. Safe to call before
  // the scene exists (e.g. before the custom layer has finished loading).
  function syncRouteMesh() {
    const scene = sceneRef.current
    if (!scene) return

    if (routeMeshRef.current) {
      scene.remove(routeMeshRef.current)
      routeMeshRef.current.geometry.dispose()
      ;(routeMeshRef.current.material as THREE.Material).dispose()
      routeMeshRef.current = null
    }
    if (routeRef.current) {
      const mesh = buildRouteMesh(routeRef.current, fetchCenterRef.current)
      if (mesh) {
        scene.add(mesh)
        routeMeshRef.current = mesh
      }
    }
    mapRef.current?.triggerRepaint()
  }

  function stopFlythrough() {
    cancelAnimationFrame(flythroughRafRef.current)
    setFlythroughActive(false)
  }

  // Animate the camera along `routeCoords` at a roughly constant real-world
  // pace (eased at the start/end), with the bearing easing toward the
  // direction of travel rather than snapping at each corner. Cancels any
  // flythrough already in progress rather than letting two race.
  function playRouteFlythrough(routeCoords: GeoJSON.Position[]) {
    const map = mapRef.current
    if (!map || routeCoords.length < 2) return
    cancelAnimationFrame(flythroughRafRef.current)

    const table = buildRoutePathTable(routeCoords, fetchCenterRef.current)
    if (table.total <= 0) return

    const durationS = Math.min(
      FLYTHROUGH_MAX_DURATION_S,
      Math.max(FLYTHROUGH_MIN_DURATION_S, table.total / FLYTHROUGH_TARGET_SPEED_M_S),
    )

    setCameraMode('fly')
    setFlythroughActive(true)

    let startTime: number | null = null
    let smoothedBearing = map.getBearing()

    const tick = (now: number) => {
      if (startTime === null) startTime = now
      const t = Math.min(1, (now - startTime) / (durationS * 1000))
      const easedDistance = easeInOutQuad(t) * table.total
      const { xy } = pointAndBearingAtDistance(table, easedDistance)
      const targetBearing = lookaheadBearingAtDistance(table, easedDistance, FLYTHROUGH_BEARING_LOOKAHEAD_M)
      if (targetBearing !== null) {
        smoothedBearing = lerpBearing(smoothedBearing, targetBearing, FLYTHROUGH_BEARING_SMOOTHING)
      }
      const [lng, lat] = offsetLngLat([fetchCenterRef.current.lon, fetchCenterRef.current.lat], xy[0], xy[1])
      map.jumpTo({ center: [lng, lat], bearing: smoothedBearing, pitch: FLYTHROUGH_PITCH, zoom: FLYTHROUGH_ZOOM })

      if (t < 1) {
        flythroughRafRef.current = requestAnimationFrame(tick)
      } else {
        setFlythroughActive(false)
      }
    }
    flythroughRafRef.current = requestAnimationFrame(tick)
  }

  useEffect(() => {
    if (!containerRef.current) return

    const fetchCenter = origin ?? KARLSRUHE_CENTER
    fetchCenterRef.current = fetchCenter

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: [fetchCenter.lon, fetchCenter.lat],
      zoom: 17,
      pitch: 60,
    })
    mapRef.current = map

    map.addControl(new maplibregl.NavigationControl(), 'top-right')
    map.on('rotate', () => setBearing(map.getBearing()))
    // Click-to-pick origin/destination, same behavior as the 2D map — this
    // view previously had no way to set either point except the sidebar's
    // text inputs. Ignored during a flythrough (which doesn't disable this
    // independent 'click' handler the way it disables dragPan/scrollZoom
    // etc.) so a stray click mid-animation can't reset the route out from
    // under it.
    map.on('click', (e: maplibregl.MapMouseEvent) => {
      if (flythroughActiveRef.current) return
      onMapClickRef.current({ lat: e.lngLat.lat, lon: e.lngLat.lng })
    })

    const modelAsMercator = maplibregl.MercatorCoordinate.fromLngLat([fetchCenter.lon, fetchCenter.lat], 0)
    const modelScale = modelAsMercator.meterInMercatorCoordinateUnits()

    let scene: THREE.Scene
    let camera: THREE.PerspectiveCamera
    let renderer: THREE.WebGLRenderer

    const customLayer: maplibregl.CustomLayerInterface = {
      id: 'threejs-layer',
      type: 'custom',
      renderingMode: '3d',
      onAdd(_map, gl) {
        camera = new THREE.PerspectiveCamera()
        scene = new THREE.Scene()
        sceneRef.current = scene

        const { light, hemi } = createSunLight()
        sunLightRef.current = light
        scene.add(light)
        scene.add(light.target)
        scene.add(hemi)
        // Kept low so shadowed faces stay visibly darker than lit ones (see
        // createSunLight's comment on the same lit/shadow contrast goal).
        scene.add(new THREE.AmbientLight(0xffffff, 0.18))

        const sunMarker = createSunMarker()
        sunMarkerRef.current = sunMarker
        scene.add(sunMarker)

        animatedHourRef.current = timeHour
        const initialDate = new Date(isoAtHour(timeHour))
        updateSunLight(light, initialDate, fetchCenter, sunTargetRef.current, sunDistanceRef.current)
        positionSunMarker(sunMarker, initialDate, fetchCenter)

        addGroundPlane(scene, GROUND_PLANE_SIZE_M)
        syncRouteMesh()
        syncMarkers()
        refreshTreesNear(scene, fetchCenter, fetchCenter)

        renderer = new THREE.WebGLRenderer({
          canvas: map.getCanvas(),
          context: gl as unknown as WebGLRenderingContext,
          antialias: true,
        })
        renderer.autoClear = false
        renderer.shadowMap.enabled = true
        // VSMShadowMap has a documented quirk (see three.js's own constants.js):
        // "all shadow receivers will also cast shadows" — our flat ground
        // plane has receiveShadow=true for buildings/trees to cast onto it,
        // so under VSM it also became a caster, self-shadowing across its
        // own huge span and reading as one uniform dark disc/square over the
        // whole fetch radius, not real per-building shadows. PCFShadowMap
        // doesn't have that behavior. (Requesting PCFSoftShadowMap directly
        // was tried and reverted — this three.js version (r185) deprecated it
        // and silently downgrades to PCFShadowMap *inside* the per-frame
        // shadow-map render call, after materials have already compiled
        // against the originally-requested type. That runtime type-switch
        // left the shadow depth texture's GL sampler configuration
        // mismatched against the compiled shader's sampler type — confirmed
        // live via real WebGL console errors, "GL_INVALID_OPERATION:
        // glDrawElements: Mismatch between texture format and sampler type
        // (signed/unsigned/float/shadow)", escalating to a full context
        // loss under sustained rendering. Requesting PCFShadowMap up front
        // avoids the runtime downgrade entirely, so materials compile
        // against the type that's actually used from the first frame.)
        renderer.shadowMap.type = THREE.PCFShadowMap

        loadBuildingsNear(scene, map, fetchCenter, fetchCenter)
      },
      render(_gl, options) {
        const m = new THREE.Matrix4().fromArray(options.defaultProjectionData.mainMatrix)
        // Mercator Y decreases going north (it's a south-positive axis), but our
        // local-meters coordinate system (lngLatToLocalMeters) is north-positive
        // for readability everywhere else in this file. Negating the Y scale here
        // is the one place that reconciles the two conventions — without it every
        // building/tree/route point is mirrored north<->south around the model
        // origin, which is why buildings looked rotated/skewed against the real
        // street grid and the route looked like it cut through them.
        const l = new THREE.Matrix4()
          .makeTranslation(modelAsMercator.x, modelAsMercator.y, modelAsMercator.z)
          .scale(new THREE.Vector3(modelScale, -modelScale, modelScale))

        camera.projectionMatrix = m.multiply(l)
        renderer.resetState()
        renderer.render(scene, camera)
        map.triggerRepaint()
      },
    }

    map.on('load', () => {
      map.addLayer(customLayer)
    })

    // Keep loading real trees near wherever the camera ends up, not just the
    // original fetch point — throttled since walk mode calls jumpTo (which
    // fires 'moveend') on every animation frame while moving. Also re-fit
    // the shadow camera's frustum to cover both the fixed building circle
    // (around the model origin) and the tree circle around that same current
    // point (see SHADOW_FRUSTUM_M's comment): a frustum just recentered on
    // the camera without resizing would drop buildings back near the origin
    // once the camera's roamed far enough that the two circles don't
    // overlap — this covers both regardless of the distance between them.
    let lastMoveCheck = 0
    const onMoveEnd = () => {
      const now = performance.now()
      if (now - lastMoveCheck < TREE_MOVE_THROTTLE_MS) return
      lastMoveCheck = now
      if (!sceneRef.current) return
      const c = map.getCenter()
      refreshTreesNear(sceneRef.current, { lat: c.lat, lon: c.lng }, fetchCenter)
      loadBuildingsNear(sceneRef.current, map, { lat: c.lat, lon: c.lng }, fetchCenter)

      const light = sunLightRef.current
      if (light) {
        // Buildings and trees both load around the camera now, so the shadow
        // frustum just follows the camera at a fixed size (rather than
        // stretching to also cover the start point, which would spread the
        // shadow map thinner and blur shadows the farther the camera roams).
        const cameraLocal = lngLatToLocalMeters(fetchCenter, [c.lng, c.lat])
        const halfExtent = SHADOW_FRUSTUM_M
        light.shadow.camera.left = -halfExtent
        light.shadow.camera.right = halfExtent
        light.shadow.camera.top = halfExtent
        light.shadow.camera.bottom = -halfExtent
        sunTargetRef.current = cameraLocal
        // Must grow with halfExtent (see SUN_LIGHT_DISTANCE_MIN_M's comment)
        // or far-side geometry gets clipped to negative depth instead of
        // just leaving the frustum's XY bounds.
        sunDistanceRef.current = Math.max(SUN_LIGHT_DISTANCE_MIN_M, halfExtent + 100)
        light.shadow.camera.far = sunDistanceRef.current + halfExtent + 100
        // Required after touching left/right/top/bottom/far above — see the
        // matching comment in createSunLight for why the shadow camera would
        // otherwise silently keep rendering with its previous frustum.
        light.shadow.camera.updateProjectionMatrix()
        const date = new Date(isoAtHour(animatedHourRef.current))
        updateSunLight(light, date, fetchCenter, sunTargetRef.current, sunDistanceRef.current)
        map.triggerRepaint()
      }
    }
    map.on('moveend', onMoveEnd)

    return () => {
      cancelAnimationFrame(sunAnimFrameRef.current)
      cancelAnimationFrame(flythroughRafRef.current)
      map.off('moveend', onMoveEnd)
      map.remove()
      mapRef.current = null
      sunLightRef.current = null
      sunMarkerRef.current = null
      sceneRef.current = null
      routeMeshRef.current = null
      originMarkerRef.current = null
      destMarkerRef.current = null
      for (const entry of loadedTreesRef.current.values()) {
        entry.group.traverse((obj) => {
          if (obj instanceof THREE.Mesh) {
            obj.geometry.dispose()
            ;(obj.material as THREE.Material).dispose()
          }
        })
      }
      loadedTreesRef.current.clear()
      lastTreeFetchCenterRef.current = null
      loadedBuildingIdsRef.current.clear()
      buildingCirclesRef.current = []
      lastBuildingFetchCenterRef.current = null
      buildingFetchInFlightRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep the route line in sync with the computed route.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    syncRouteMesh()
  }, [route])

  // Play a cinematic flythrough whenever a *new* origin/destination pair
  // resolves to a route — but not on every re-fetch of the same pair (e.g.
  // dragging the shade-preference or time-of-day slider, which also
  // recomputes `route`), so it only plays when the user actually picks a
  // new route rather than re-triggering constantly while they tune it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!route || !origin || !destination) {
      flythroughKeyRef.current = null
      return
    }
    const key = `${origin.lat.toFixed(6)},${origin.lon.toFixed(6)}|${destination.lat.toFixed(6)},${destination.lon.toFixed(6)}`
    if (key === flythroughKeyRef.current) return
    flythroughKeyRef.current = key

    const coords = route.coordinates
    if (sceneRef.current) {
      playRouteFlythrough(coords)
    } else {
      // The custom three.js layer (and its `onAdd`) only finishes after the
      // map's own 'load' event — a route picked before that has happened
      // (e.g. immediately on mount) needs to wait for it rather than
      // starting the flythrough against a scene that doesn't exist yet.
      mapRef.current?.once('load', () => playRouteFlythrough(coords))
    }
  }, [route, origin, destination])

  // Keep the origin/destination pin markers in sync.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    syncMarkers()
  }, [origin, destination])

  // Drive the sun position from the shared time-of-day slider, animating
  // smoothly to the new position rather than snapping.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    animateSunTo(timeHour, origin ?? KARLSRUHE_CENTER)
  }, [timeHour, origin])

  // Camera mode: free-fly uses MapLibre's default interaction handlers;
  // walk mode disables them in favor of WASD + mouse-drag-look below. A
  // flythrough in progress locks them out the same way walk mode does
  // (regardless of which mode is otherwise selected), since it's driving
  // the camera itself via jumpTo — manual input during it would fight the
  // animation instead of just being ignored.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (cameraMode === 'walk' || flythroughActive) {
      map.dragPan.disable()
      map.dragRotate.disable()
      map.scrollZoom.disable()
      map.doubleClickZoom.disable()
      map.touchZoomRotate.disable()
      map.keyboard.disable()
      if (cameraMode === 'walk' && !flythroughActive) map.setPitch(WALK_PITCH)
    } else {
      map.dragPan.enable()
      map.dragRotate.enable()
      map.scrollZoom.enable()
      map.doubleClickZoom.enable()
      map.touchZoomRotate.enable()
      map.keyboard.enable()
    }
  }, [cameraMode, flythroughActive])

  // Walk mode: WASD/arrow movement relative to bearing.
  useEffect(() => {
    if (cameraMode !== 'walk' || flythroughActive) return
    const map = mapRef.current
    if (!map) return

    const keysDown = new Set<string>()
    const onKeyDown = (e: KeyboardEvent) => keysDown.add(e.key.toLowerCase())
    const onKeyUp = (e: KeyboardEvent) => keysDown.delete(e.key.toLowerCase())
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)

    let raf = 0
    let last = performance.now()

    const tick = (now: number) => {
      const dt = (now - last) / 1000
      last = now

      let forward = 0
      let strafe = 0
      if (keysDown.has('w') || keysDown.has('arrowup')) forward += 1
      if (keysDown.has('s') || keysDown.has('arrowdown')) forward -= 1
      if (keysDown.has('d') || keysDown.has('arrowright')) strafe += 1
      if (keysDown.has('a') || keysDown.has('arrowleft')) strafe -= 1

      if (forward !== 0 || strafe !== 0) {
        const bearingRad = (map.getBearing() * Math.PI) / 180
        const dist = WALK_SPEED_M_S * dt
        const dx = (Math.sin(bearingRad) * forward + Math.cos(bearingRad) * strafe) * dist
        const dy = (Math.cos(bearingRad) * forward - Math.sin(bearingRad) * strafe) * dist
        const c = map.getCenter()
        const [lng, lat] = offsetLngLat([c.lng, c.lat], dx, dy)
        map.jumpTo({ center: [lng, lat] })
      }

      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    let dragging = false
    let lastX = 0
    let lastY = 0
    const canvas = map.getCanvas()

    const onMouseDown = (e: MouseEvent) => {
      dragging = true
      lastX = e.clientX
      lastY = e.clientY
    }
    const onMouseUp = () => {
      dragging = false
    }
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging) return
      const dx = e.clientX - lastX
      const dy = e.clientY - lastY
      lastX = e.clientX
      lastY = e.clientY

      map.setBearing(map.getBearing() + dx * LOOK_SENSITIVITY)
      const nextPitch = map.getPitch() - dy * LOOK_SENSITIVITY
      map.setPitch(Math.min(WALK_PITCH_MAX, Math.max(WALK_PITCH_MIN, nextPitch)))
    }

    canvas.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mouseup', onMouseUp)
    window.addEventListener('mousemove', onMouseMove)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      canvas.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mouseup', onMouseUp)
      window.removeEventListener('mousemove', onMouseMove)
    }
  }, [cameraMode, flythroughActive])

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      <div className="absolute left-4 top-4 z-10 flex flex-col items-start gap-2">
        <div className="flex overflow-hidden rounded-lg border border-white/20 bg-slate-900/80 text-xs font-medium text-white shadow-lg backdrop-blur">
          <button
            type="button"
            onClick={() => {
              stopFlythrough()
              setCameraMode('fly')
            }}
            className={`px-3 py-2 transition-colors ${cameraMode === 'fly' ? 'bg-teal-500' : 'hover:bg-white/10'}`}
          >
            Free-fly
          </button>
          <button
            type="button"
            onClick={() => {
              stopFlythrough()
              setCameraMode('walk')
            }}
            className={`px-3 py-2 transition-colors ${cameraMode === 'walk' ? 'bg-teal-500' : 'hover:bg-white/10'}`}
          >
            Walk
          </button>
        </div>
        <SunIndicator timeHour={timeHour} bearing={bearing} center={fetchCenterRef.current} />
      </div>
      {flythroughActive && (
        <div className="absolute left-1/2 top-4 z-10 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-white/20 bg-slate-900/80 px-3 py-2 text-xs text-white shadow-lg backdrop-blur">
          <span>🎬 Flying the route…</span>
          <button
            type="button"
            onClick={stopFlythrough}
            className="rounded bg-white/10 px-2 py-1 font-medium transition-colors hover:bg-white/20"
          >
            Skip
          </button>
        </div>
      )}
      {cameraMode === 'walk' && !flythroughActive && (
        <div className="absolute bottom-4 left-4 z-10 rounded-lg border border-white/20 bg-slate-900/80 px-3 py-2 text-xs text-white shadow-lg backdrop-blur">
          WASD to move · drag to look
        </div>
      )}
    </div>
  )
}
