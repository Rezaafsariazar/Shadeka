import Button from '../ui/Button'
import Icon from '../ui/Icon'

interface RouteErrorProps {
  detail: string
  onRetry: () => void
}

export default function RouteError({ detail, onRetry }: RouteErrorProps) {
  return (
    <section role="alert" className="flex flex-col gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 animate-enter">
      <div className="flex items-start gap-2.5">
        <Icon name="alert" size={18} className="mt-0.5 shrink-0 text-rose-700" />
        <div>
          <p className="text-sm font-semibold text-rose-900">Couldn’t find a route</p>
          <p className="mt-0.5 text-xs text-rose-800">
            The routing service didn’t respond as expected. Try again, or move one of the points slightly.
          </p>
          <p className="mt-1 text-[11px] text-rose-800/80">{detail}</p>
        </div>
      </div>
      <Button variant="secondary" size="sm" onClick={onRetry} className="self-start">
        <Icon name="replay" size={14} />
        Try again
      </Button>
    </section>
  )
}
