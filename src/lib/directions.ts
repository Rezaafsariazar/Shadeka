// Turn-by-turn directions derived purely from the route's own geometry. The
// backend's /route endpoint only returns a LineString (no street names or
// maneuver list), so this approximates what a real routing API would give by
// walking the polyline and calling out a step wherever the heading changes
// enough to be a real turn, rather than just GPS/vertex noise.

export interface DirectionStep {
  instruction: string
  /** Distance (meters) to walk for this step, i.e. until the next one (or the destination). */
  distanceM: number
}

// Turns are only detected between points at least this far apart — real
// street polylines pack vertices every few meters, so comparing consecutive
// raw points would flag every tiny wiggle as a "turn".
const MIN_SEGMENT_M = 15
// Heading change (degrees) below this is "still basically going the same way".
const TURN_THRESHOLD_DEG = 30

function distanceMeters(a: GeoJSON.Position, b: GeoJSON.Position): number {
  const metersPerDegLat = 111320
  const metersPerDegLon = 111320 * Math.cos(((a[1] + b[1]) / 2) * (Math.PI / 180))
  const dx = (b[0] - a[0]) * metersPerDegLon
  const dy = (b[1] - a[1]) * metersPerDegLat
  return Math.hypot(dx, dy)
}

/** Compass bearing (0=N, 90=E, clockwise) from `a` to `b`. */
function bearingDeg(a: GeoJSON.Position, b: GeoJSON.Position): number {
  const metersPerDegLat = 111320
  const metersPerDegLon = 111320 * Math.cos(((a[1] + b[1]) / 2) * (Math.PI / 180))
  const dx = (b[0] - a[0]) * metersPerDegLon
  const dy = (b[1] - a[1]) * metersPerDegLat
  return ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360
}

/** Signed smallest-angle difference from `a` to `b`, in (-180, 180]. Positive = clockwise (right). */
function angleDiff(a: number, b: number): number {
  return ((b - a + 540) % 360) - 180
}

const COMPASS_LABELS = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest']

function compassLabel(bearing: number): string {
  return COMPASS_LABELS[Math.round(bearing / 45) % 8]
}

function turnInstruction(diff: number): string {
  const magnitude = Math.abs(diff)
  const side = diff > 0 ? 'right' : 'left'
  if (magnitude > 135) return `Turn sharply ${side}`
  if (magnitude > 75) return `Turn ${side}`
  return `Turn slightly ${side}`
}

/** Build a turn-by-turn step list for a walking route's geometry. */
export function buildTurnByTurn(route: GeoJSON.LineString): DirectionStep[] {
  const coords = route.coordinates
  if (coords.length < 2) return []

  const cumulative = [0]
  for (let i = 1; i < coords.length; i++) {
    cumulative.push(cumulative[i - 1] + distanceMeters(coords[i - 1], coords[i]))
  }
  const total = cumulative[cumulative.length - 1]

  const steps: DirectionStep[] = []
  let checkpoint = 0 // index of the last "bearing anchor" point
  let anchorBearing = bearingDeg(coords[0], coords[1])
  let lastTurnDist = 0 // cumulative distance where the current step began

  steps.push({ instruction: `Head ${compassLabel(anchorBearing)}`, distanceM: 0 })

  for (let i = 1; i < coords.length; i++) {
    const isLast = i === coords.length - 1
    if (cumulative[i] - cumulative[checkpoint] < MIN_SEGMENT_M && !isLast) continue

    const newBearing = bearingDeg(coords[checkpoint], coords[i])
    const diff = angleDiff(anchorBearing, newBearing)

    if (Math.abs(diff) >= TURN_THRESHOLD_DEG) {
      steps[steps.length - 1].distanceM = cumulative[checkpoint] - lastTurnDist
      steps.push({ instruction: turnInstruction(diff), distanceM: 0 })
      lastTurnDist = cumulative[checkpoint]
      anchorBearing = newBearing
    }
    checkpoint = i
  }

  steps[steps.length - 1].distanceM = total - lastTurnDist
  steps.push({ instruction: 'Arrive at your destination', distanceM: 0 })

  return steps
}
