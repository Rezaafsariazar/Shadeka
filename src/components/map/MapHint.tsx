import Icon, { type IconName } from '../ui/Icon'
import { OVERLAY_SURFACE } from './overlay'

interface MapHintProps {
  icon: IconName
  children: string
  className?: string
}

/** A small, non-interactive status pill over the map. */
export default function MapHint({ icon, children, className = '' }: MapHintProps) {
  return (
    <div
      role="status"
      className={`pointer-events-none flex items-center gap-2 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium text-ink-soft animate-enter ${OVERLAY_SURFACE} ${className}`}
    >
      <Icon name={icon} size={14} className="text-brand-ink" />
      {children}
    </div>
  )
}
