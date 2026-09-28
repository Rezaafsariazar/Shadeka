import Icon from '../ui/Icon'
import { OVERLAY_SURFACE } from './overlay'

interface FlythroughBarProps {
  progress: number
  onSkip: () => void
}

export default function FlythroughBar({ progress, onSkip }: FlythroughBarProps) {
  const pct = Math.round(progress * 100)
  return (
    <div className={`flex w-72 flex-col gap-2 px-3 py-2.5 animate-enter ${OVERLAY_SURFACE}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm font-medium text-ink">
          <Icon name="film" size={16} className="text-brand" />
          Flying your route
        </span>
        <button
          type="button"
          onClick={onSkip}
          className="rounded-lg px-2 py-1 text-xs font-semibold text-brand transition-colors hover:bg-brand-soft"
        >
          Skip
        </button>
      </div>
      <div
        role="progressbar"
        aria-label="Flythrough progress"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1.5 overflow-hidden rounded-full bg-slate-200"
      >
        <div className="h-full rounded-full bg-brand-accent" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
