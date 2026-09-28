import type { RouteResponse } from '../../lib/api'
import { formatDistance } from '../../lib/format'

function shadeRating(pct: number): { label: string; className: string } {
  if (pct >= 70) return { label: 'Well shaded', className: 'bg-emerald-50 text-emerald-800 ring-emerald-600/20' }
  if (pct >= 40) return { label: 'Partly shaded', className: 'bg-amber-50 text-amber-900 ring-amber-600/20' }
  return { label: 'Mostly sunny', className: 'bg-rose-50 text-rose-800 ring-rose-600/20' }
}

interface RouteSummaryProps {
  route: RouteResponse
  updating: boolean
}

export default function RouteSummary({ route, updating }: RouteSummaryProps) {
  const pct = Math.round(route.shade_pct * 100)
  const rating = shadeRating(pct)

  return (
    <section aria-label="Route summary" className="flex flex-col gap-3 border-t border-line-soft py-5 animate-enter">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted">Your route</h2>
        {updating && (
          <span className="flex items-center gap-1.5 text-xs text-ink-muted" aria-live="polite">
            <span className="h-1.5 w-1.5 animate-shimmer rounded-full bg-brand-accent" />
            Updating
          </span>
        )}
      </div>
      <div className={`flex items-center justify-between gap-3 rounded-xl px-4 py-3 ring-1 ring-inset ${rating.className}`}>
        <div>
          <div className="text-3xl font-semibold leading-none tracking-tight tabular-nums">{pct}%</div>
          <div className="mt-1 text-xs font-medium">in shade</div>
        </div>
        <span className="rounded-full bg-white/70 px-2.5 py-1 text-xs font-semibold">{rating.label}</span>
      </div>
      <dl className="grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-surface-sunken px-3 py-2.5">
          <dt className="text-xs text-ink-muted">Distance</dt>
          <dd className="text-lg font-semibold tabular-nums text-ink">{formatDistance(route.distance_m)}</dd>
        </div>
        <div className="rounded-xl bg-surface-sunken px-3 py-2.5">
          <dt className="text-xs text-ink-muted">Walking time</dt>
          <dd className="text-lg font-semibold tabular-nums text-ink">{Math.round(route.estimated_minutes)} min</dd>
        </div>
      </dl>
    </section>
  )
}

export function RouteSummarySkeleton() {
  return (
    <section aria-label="Finding a route" aria-busy="true" className="flex flex-col gap-3 border-t border-line-soft py-5">
      <div className="h-3 w-20 animate-shimmer rounded bg-slate-100" />
      <div className="h-[68px] animate-shimmer rounded-xl bg-slate-100" />
      <div className="grid grid-cols-2 gap-2">
        <div className="h-[60px] animate-shimmer rounded-xl bg-slate-100" />
        <div className="h-[60px] animate-shimmer rounded-xl bg-slate-100" />
      </div>
      <span className="sr-only">Finding the shadiest route…</span>
    </section>
  )
}
