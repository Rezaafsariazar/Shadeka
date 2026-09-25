import { usePlayback, useTimeTarget } from '../hooks/useTime'
import { formatMinutes, TIME_MAX, TIME_MIN, TIME_STEP } from '../lib/time'
import { timeStore, type PlaybackSpeed } from '../lib/timeStore'

const SPEEDS: PlaybackSpeed[] = [1, 2, 4]

// The input itself runs at 1-minute resolution so dragging and playback move
// the thumb continuously; the keyboard jumps to the next grid point instead
// (5 minutes, or a whole hour with PageUp/PageDown), so 13:01 → lands on 13:05.
const nextUp = (m: number, step: number) => Math.floor(m / step) * step + step
const nextDown = (m: number, step: number) => Math.ceil(m / step) * step - step
const KEY_STEPS: Record<string, (current: number) => number> = {
  ArrowRight: (m) => nextUp(m, TIME_STEP),
  ArrowUp: (m) => nextUp(m, TIME_STEP),
  ArrowLeft: (m) => nextDown(m, TIME_STEP),
  ArrowDown: (m) => nextDown(m, TIME_STEP),
  PageUp: (m) => nextUp(m, 60),
  PageDown: (m) => nextDown(m, 60),
  Home: () => TIME_MIN,
  End: () => TIME_MAX,
}

export default function TimeControl() {
  const minutes = useTimeTarget()
  const { playing, speed } = usePlayback()

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <span className="text-sm font-medium text-slate-700">Time of day</span>
          <span className="text-2xl font-semibold tabular-nums leading-tight text-slate-900">{formatMinutes(minutes)}</span>
        </div>
        <div className="flex items-center gap-2">
          <div role="group" aria-label="Time-lapse speed" className="flex rounded-lg bg-slate-100 p-0.5">
            {SPEEDS.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={speed === s}
                onClick={() => timeStore.setSpeed(s)}
                className={`rounded-md px-1.5 py-1 text-xs font-medium tabular-nums transition-colors ${
                  speed === s ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {s}×
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => timeStore.togglePlay()}
            aria-label={playing ? 'Pause time-lapse' : 'Play time-lapse'}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-700 text-white shadow-sm transition-colors hover:bg-teal-800"
          >
            {playing ? (
              <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                <rect x="3.5" y="2.5" width="3" height="11" rx="1" />
                <rect x="9.5" y="2.5" width="3" height="11" rx="1" />
              </svg>
            ) : (
              <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                <path d="M4.5 2.8v10.4a.8.8 0 0 0 1.2.7l8.3-5.2a.8.8 0 0 0 0-1.4L5.7 2.1a.8.8 0 0 0-1.2.7Z" />
              </svg>
            )}
          </button>
        </div>
      </div>
      <input
        type="range"
        aria-label="Time of day"
        aria-valuetext={formatMinutes(minutes)}
        min={TIME_MIN}
        max={TIME_MAX}
        step={1}
        value={minutes}
        onPointerDown={() => timeStore.pause()}
        onKeyDown={(e) => {
          const step = KEY_STEPS[e.key]
          if (!step) return
          e.preventDefault()
          timeStore.pause()
          timeStore.setTarget(step(minutes))
        }}
        onChange={(e) => {
          timeStore.pause()
          timeStore.setTarget(Number(e.target.value))
        }}
        className="accent-teal-600"
      />
      <div className="flex justify-between text-xs tabular-nums text-slate-500">
        <span>{formatMinutes(TIME_MIN)}</span>
        <span>{formatMinutes(TIME_MAX)}</span>
      </div>
    </div>
  )
}
