import * as SunCalc from 'suncalc'
import { isoAtHour, type LatLon } from '../lib/api'

interface SunIndicatorProps {
  timeHour: number
  bearing: number
  center: LatLon
}

const WIDGET_SIZE = 64
const CENTER = WIDGET_SIZE / 2
const MAX_RADIUS = 24 // dot sits here at the horizon, moves toward center as the sun climbs

const COMPASS_LABELS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']

function compassLabel(azimuthDeg: number): string {
  const index = Math.round(((azimuthDeg % 360) + 360) % 360 / 45) % 8
  return COMPASS_LABELS[index]
}

// SunCalc.getPosition returns altitude/azimuth already in degrees, azimuth
// clockwise from north (verified against the installed v2.0.1 README) — no
// radians conversion needed here, unlike the classic suncalc.js API.
export default function SunIndicator({ timeHour, bearing, center }: SunIndicatorProps) {
  const date = new Date(isoAtHour(timeHour))
  const { altitude, azimuth } = SunCalc.getPosition(date, center.lat, center.lon)
  const isUp = altitude > 0

  const azimuthRad = (azimuth * Math.PI) / 180
  const radius = isUp ? MAX_RADIUS * (1 - Math.min(altitude, 90) / 90) : MAX_RADIUS
  const dotX = CENTER + radius * Math.sin(azimuthRad)
  const dotY = CENTER - radius * Math.cos(azimuthRad)

  return (
    <div
      className="flex flex-col items-center gap-1 rounded-xl border border-slate-200/70 bg-white/85 px-2 py-2 shadow-md backdrop-blur-sm"
      title={`Sun: ${Math.round(azimuth)}° azimuth, ${Math.round(altitude)}° elevation`}
    >
      <div
        className="relative rounded-full border border-slate-300 bg-sky-50"
        style={{ width: WIDGET_SIZE, height: WIDGET_SIZE }}
      >
        {/* Rotates opposite the map bearing so "up" always tracks true north,
            keeping the sun dot's screen position correct as the user rotates
            the map (bearing is measured counter-clockwise from north). */}
        <div
          className="absolute inset-0"
          style={{ transform: `rotate(${-bearing}deg)` }}
        >
          <span className="absolute left-1/2 top-0.5 -translate-x-1/2 text-[9px] font-semibold text-slate-400">
            N
          </span>
          <div
            className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full transition-[left,top,opacity] duration-300"
            style={{
              left: dotX,
              top: dotY,
              backgroundColor: isUp ? '#fbbf24' : '#94a3b8',
              boxShadow: isUp ? '0 0 6px 2px rgba(251,191,36,0.7)' : 'none',
              opacity: isUp ? 1 : 0.45,
            }}
          />
        </div>
      </div>
      <span className="text-[10px] font-medium leading-none text-slate-500">
        {isUp ? `${Math.round(altitude)}° ${compassLabel(azimuth)}` : 'below horizon'}
      </span>
    </div>
  )
}
