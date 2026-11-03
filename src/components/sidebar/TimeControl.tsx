import { usePlayback, useTimeTarget } from '../../hooks/useTime'
import { formatMinutes, TIME_MAX, TIME_MIN, TIME_STEP } from '../../lib/time'
import { timeStore, type PlaybackSpeed } from '../../lib/timeStore'
import Icon from '../ui/Icon'
import Section from './Section'

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

const TICKS = [6, 9, 12, 15, 18, 21]

export default function TimeControl() {
  const minutes = useTimeTarget()
  const { playing, speed } = usePlayback()

  return (
    <Section title="Time of day">
      <div className="flex items-end justify-between gap-3">
        <output aria-live="off" className="text-[2rem] font-semibold leading-none tracking-tight tabular-nums text-ink">
          {formatMinutes(minutes)}
        </output>
        <div className="flex items-center gap-2">
          <div role="group" aria-label="Time-lapse speed" className="flex rounded-lg bg-surface-muted p-0.5">
            {SPEEDS.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={speed === s}
                aria-label={`${s} times speed`}
                onClick={() => timeStore.setSpeed(s)}
                className={`h-7 min-w-8 rounded-md px-1.5 text-xs font-semibold tabular-nums transition-colors duration-200 ${
                  speed === s ? 'bg-surface-raised text-ink shadow-sm' : 'text-ink-muted hover:text-ink-soft'
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
            title={playing ? 'Pause time-lapse' : 'Play time-lapse'}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-brand text-white shadow-sm transition-[background-color,transform] duration-200 hover:bg-brand-hover active:scale-95"
          >
            <Icon name={playing ? 'pause' : 'play'} size={18} />
          </button>
        </div>
      </div>

      <div>
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
          className="range range-time"
        />
        <div className="relative mx-3 mt-1 h-4 text-[11px] tabular-nums text-ink-muted" aria-hidden="true">
          {TICKS.map((h) => (
            <span
              key={h}
              className="absolute -translate-x-1/2"
              style={{ left: `${((h * 60 - TIME_MIN) / (TIME_MAX - TIME_MIN)) * 100}%` }}
            >
              {String(h).padStart(2, '0')}
            </span>
          ))}
        </div>
      </div>
    </Section>
  )
}
