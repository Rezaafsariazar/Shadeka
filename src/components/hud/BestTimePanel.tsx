import type { HourlyShade } from '../../hooks/useShadeByHour'
import { timeStore } from '../../lib/timeStore'
import { useTimeTarget } from '../../hooks/useTime'
import HudPanel from './HudPanel'

interface BestTimePanelProps {
  hasRoute: boolean
  data: (HourlyShade | null)[] | null
  hours: number[]
  error: string | null
}

export default function BestTimePanel({ hasRoute, data, hours, error }: BestTimePanelProps) {
  const selectedHour = Math.round(useTimeTarget() / 60)
  const loaded = data?.filter((d): d is HourlyShade => d !== null) ?? []
  const best = loaded.reduce<HourlyShade | null>((b, d) => (!b || d.shadePct > b.shadePct ? d : b), null)

  return (
    <HudPanel
      code="03"
      title="Best time to walk"
      aside={
        hasRoute && data ? (
          <span className="font-mono text-[11px] tabular-nums text-ink-muted">
            {loaded.length}/{hours.length} h
          </span>
        ) : undefined
      }
    >
      {!hasRoute && <p className="text-sm text-ink-muted">Set a start and destination to compare every hour of the day.</p>}
      {hasRoute && (
        <>
          <div className="flex items-baseline justify-between gap-3">
            {best ? (
              <p className="text-sm text-ink-soft">
                Shadiest at <span className="font-mono text-brand-ink hud-glow">{String(best.hour).padStart(2, '0')}:00</span>{' '}
                with <span className="font-mono text-ink">{best.shadePct}%</span> shade
              </p>
            ) : (
              <p className="text-sm text-ink-muted">Computing the route for each hour…</p>
            )}
          </div>
          <div className="flex h-28 items-end gap-[3px]" role="group" aria-label="Shade percentage by hour; select an hour to jump to it">
            {hours.map((h, i) => {
              const d = data?.[i] ?? null
              const isBest = best?.hour === h
              const isSelected = selectedHour === h
              return (
                <button
                  key={h}
                  type="button"
                  disabled={!d}
                  onClick={() => {
                    timeStore.pause()
                    timeStore.setTarget(h * 60)
                  }}
                  aria-label={d ? `${String(h).padStart(2, '0')}:00, ${d.shadePct}% shade, ${d.minutes} minutes` : `${h}:00 loading`}
                  aria-pressed={isSelected}
                  className="group relative flex h-full flex-1 items-end"
                >
                  <span
                    className={`w-full rounded-t-[2px] transition-[height,background-color] duration-500 ease-(--ease-out-soft) ${
                      !d
                        ? 'animate-shimmer bg-surface-raised'
                        : isBest
                          ? 'bg-brand-accent shadow-[0_0_12px_-2px] shadow-cyan-400'
                          : isSelected
                            ? 'bg-hud-amber'
                            : 'bg-brand-accent/35 group-hover:bg-brand-accent/60'
                    }`}
                    style={{ height: d ? `${Math.max(4, d.shadePct)}%` : '18%' }}
                  />
                  {isSelected && <span className="absolute -top-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-hud-amber" aria-hidden="true" />}
                </button>
              )
            })}
          </div>
          <div className="flex justify-between font-mono text-[10px] tabular-nums text-ink-muted" aria-hidden="true">
            {hours.filter((h) => h % 3 === 0).map((h) => (
              <span key={h}>{String(h).padStart(2, '0')}</span>
            ))}
          </div>
          {error && loaded.length === 0 && <p className="text-xs text-danger-ink">Routing service unavailable.</p>}
        </>
      )}
    </HudPanel>
  )
}
