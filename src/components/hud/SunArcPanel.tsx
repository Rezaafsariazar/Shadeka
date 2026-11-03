import { useMemo } from 'react'
import * as SunCalc from 'suncalc'
import { useDisplayTime } from '../../hooks/useTime'
import { dateAtMinutes, formatMinutes } from '../../lib/time'
import type { LatLon } from '../../lib/api'
import HudPanel, { Readout } from './HudPanel'

const W = 320
const H = 120
const PAD_X = 8
const START_MIN = 4 * 60
const END_MIN = 22 * 60
const MIN_ALT = -12
const MAX_ALT = 70
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']

const x = (m: number) => PAD_X + ((m - START_MIN) / (END_MIN - START_MIN)) * (W - PAD_X * 2)
const y = (alt: number) => H - 14 - ((alt - MIN_ALT) / (MAX_ALT - MIN_ALT)) * (H - 24)

/** Local minutes of a suncalc event; null (sun never rises/sets that day) falls back. */
function minutesOf(date: Date | null, fallback: number): number {
  return date ? date.getHours() * 60 + date.getMinutes() : fallback
}

/** The sun's real altitude across today (suncalc), with sunrise/sunset, golden hours and the selected time. */
export default function SunArcPanel({ center }: { center: LatLon }) {
  const display = useDisplayTime()

  const { path, times } = useMemo(() => {
    const points: string[] = []
    for (let m = START_MIN; m <= END_MIN; m += 10) {
      const alt = SunCalc.getPosition(dateAtMinutes(m), center.lat, center.lon).altitude
      points.push(`${points.length ? 'L' : 'M'}${x(m).toFixed(1)},${y(Math.max(MIN_ALT, alt)).toFixed(1)}`)
    }
    return { path: points.join(' '), times: SunCalc.getTimes(dateAtMinutes(12 * 60), center.lat, center.lon) }
  }, [center.lat, center.lon])

  const { altitude, azimuth } = SunCalc.getPosition(dateAtMinutes(display), center.lat, center.lon)
  const up = altitude > 0
  const compass = COMPASS[Math.round((((azimuth % 360) + 360) % 360) / 45) % 8]
  // A real, readable consequence of the altitude: how long a shadow is.
  const shadowRatio = up ? 1 / Math.tan((Math.max(altitude, 1) * Math.PI) / 180) : null

  const sunrise = minutesOf(times.sunrise, START_MIN)
  const sunset = minutesOf(times.sunset, END_MIN)
  const goldenEnd = minutesOf(times.goldenHourEnd, sunrise)
  const goldenStart = minutesOf(times.goldenHour, sunset)
  const noon = minutesOf(times.solarNoon, 12 * 60)
  const cx = x(Math.min(END_MIN, Math.max(START_MIN, display)))
  const cy = y(Math.max(MIN_ALT, altitude))

  return (
    <HudPanel code="01" title="Solar track">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Sun altitude through the day; now ${Math.round(altitude)} degrees`}>
        <defs>
          <linearGradient id="sun-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#fbbf24" stopOpacity="0.28" />
            <stop offset="1" stopColor="#fbbf24" stopOpacity="0" />
          </linearGradient>
          <clipPath id="above-horizon">
            <rect x="0" y="0" width={W} height={y(0)} />
          </clipPath>
        </defs>
        {/* golden hours */}
        <rect x={x(sunrise)} y={0} width={Math.max(0, x(goldenEnd) - x(sunrise))} height={y(0)} fill="#f59e0b" opacity="0.08" />
        <rect x={x(goldenStart)} y={0} width={Math.max(0, x(sunset) - x(goldenStart))} height={y(0)} fill="#f59e0b" opacity="0.08" />
        {[0, 30, 60].map((a) => (
          <g key={a}>
            <line x1={PAD_X} x2={W - PAD_X} y1={y(a)} y2={y(a)} stroke={a === 0 ? '#38bdf8' : '#38bdf8'} strokeOpacity={a === 0 ? 0.45 : 0.12} strokeDasharray={a === 0 ? undefined : '2 4'} />
            <text x={W - PAD_X} y={y(a) - 3} textAnchor="end" fontSize="8" fill="#8aa0b4" fontFamily="var(--font-mono)">
              {a}°
            </text>
          </g>
        ))}
        <path d={`${path} L${x(END_MIN)},${y(0)} L${x(START_MIN)},${y(0)} Z`} fill="url(#sun-fill)" clipPath="url(#above-horizon)" />
        <path d={path} fill="none" stroke="#fbbf24" strokeWidth="1.5" strokeOpacity="0.9" />
        <line x1={cx} x2={cx} y1={4} y2={H - 14} stroke="#22d3ee" strokeOpacity="0.5" strokeDasharray="2 3" />
        <circle cx={cx} cy={cy} r="9" fill="#fbbf24" opacity={up ? 0.18 : 0.08} />
        <circle cx={cx} cy={cy} r="4" fill={up ? '#fbbf24' : '#64748b'} />
        {[sunrise, noon, sunset].map((m) => (
          <text key={m} x={x(m)} y={H - 2} textAnchor="middle" fontSize="8" fill="#8aa0b4" fontFamily="var(--font-mono)">
            {formatMinutes(m)}
          </text>
        ))}
      </svg>
      <div className="grid grid-cols-3 gap-3">
        <Readout label="Altitude" value={up ? `${Math.round(altitude)}°` : '—'} tone="amber" />
        <Readout label="Azimuth" value={`${Math.round(azimuth)}° ${compass}`} />
        <Readout label="10 m bldg" value={shadowRatio ? `${Math.round(10 * shadowRatio)} m` : 'no sun'} unit={shadowRatio ? 'shadow' : undefined} />
      </div>
      <p className="font-mono text-[11px] text-ink-muted">
        Sunrise {formatMinutes(sunrise)} · Sunset {formatMinutes(sunset)} · Golden hour from {formatMinutes(goldenStart)}
      </p>
    </HudPanel>
  )
}
