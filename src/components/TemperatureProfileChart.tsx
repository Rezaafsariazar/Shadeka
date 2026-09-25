import type { TemperatureProfilePoint } from '../lib/api'

interface TemperatureProfileChartProps {
  profile: TemperatureProfilePoint[]
}

const WIDTH = 320
const HEIGHT = 120
const PAD_LEFT = 32
const PAD_RIGHT = 8
const PAD_TOP = 10
const PAD_BOTTOM = 20

function buildPath(
  points: TemperatureProfilePoint[],
  key: 'air_temp_c' | 'felt_temp_c',
  xScale: (d: number) => number,
  yScale: (t: number) => number,
): string {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xScale(p.distance_m)},${yScale(p[key])}`).join(' ')
}

// No charting library is used anywhere else in this project (checked before
// building this) -- a plain inline SVG polyline is simplest for two lines
// over a small, fixed-shape dataset like a route's temperature profile.
export default function TemperatureProfileChart({ profile }: TemperatureProfileChartProps) {
  if (profile.length === 0) return null

  const maxDistance = profile[profile.length - 1].distance_m || 1
  const allTemps = profile.flatMap((p) => [p.air_temp_c, p.felt_temp_c])
  const minTemp = Math.min(...allTemps)
  const maxTemp = Math.max(...allTemps)
  const tempRange = Math.max(maxTemp - minTemp, 1) // avoid a degenerate 0-range scale

  const xScale = (d: number) => PAD_LEFT + (d / maxDistance) * (WIDTH - PAD_LEFT - PAD_RIGHT)
  const yScale = (t: number) =>
    HEIGHT - PAD_BOTTOM - ((t - minTemp) / tempRange) * (HEIGHT - PAD_TOP - PAD_BOTTOM)

  const airPath = buildPath(profile, 'air_temp_c', xScale, yScale)
  const feltPath = buildPath(profile, 'felt_temp_c', xScale, yScale)

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-700">Temperature along route</span>
        <div className="flex items-center gap-3 text-[11px] text-slate-500">
          <span className="flex items-center gap-1">
            <span className="h-0.5 w-3 rounded-full" style={{ backgroundColor: '#f97316' }} />
            Felt
          </span>
          <span className="flex items-center gap-1">
            <span className="h-0.5 w-3 rounded-full border-t border-dashed" style={{ borderColor: '#94a3b8' }} />
            Temperature
          </span>
        </div>
      </div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full" role="img" aria-label="Temperature and felt temperature along the route">
        {/* y-axis ticks: min/max temp */}
        <text x={2} y={yScale(maxTemp) + 4} className="fill-slate-400" fontSize="9">
          {Math.round(maxTemp)}°
        </text>
        <text x={2} y={yScale(minTemp) + 4} className="fill-slate-400" fontSize="9">
          {Math.round(minTemp)}°
        </text>
        {/* x-axis: start/end distance */}
        <text x={PAD_LEFT} y={HEIGHT - 4} className="fill-slate-400" fontSize="9">
          0 m
        </text>
        <text x={WIDTH - PAD_RIGHT} y={HEIGHT - 4} textAnchor="end" className="fill-slate-400" fontSize="9">
          {maxDistance >= 1000 ? `${(maxDistance / 1000).toFixed(1)} km` : `${Math.round(maxDistance)} m`}
        </text>

        <path d={airPath} fill="none" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="4 3" />
        <path d={feltPath} fill="none" stroke="#f97316" strokeWidth={2} />
      </svg>
    </div>
  )
}
