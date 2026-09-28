import type { LatLon } from '../../lib/api'
import { useMyLocation } from '../../hooks/useMyLocation'
import Icon from '../ui/Icon'
import Button from '../ui/Button'
import AddressField from './AddressField'

type PickMode = 'origin' | 'destination' | null

interface RouteInputsProps {
  origin: LatLon | null
  destination: LatLon | null
  onOriginChange: (v: LatLon | null) => void
  onDestinationChange: (v: LatLon | null) => void
  pickMode: PickMode
  onPickModeChange: (mode: PickMode) => void
}

export default function RouteInputs({
  origin,
  destination,
  onOriginChange,
  onDestinationChange,
  pickMode,
  onPickModeChange,
}: RouteInputsProps) {
  const { locate, locating, error: locationError } = useMyLocation(onOriginChange)

  function swap() {
    onOriginChange(destination)
    onDestinationChange(origin)
  }

  return (
    <section aria-label="Route" className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <AddressField
            label="Start"
            markerColor="var(--color-origin)"
            value={origin}
            onChange={onOriginChange}
            picking={pickMode === 'origin'}
            onPick={() => onPickModeChange(pickMode === 'origin' ? null : 'origin')}
          />
          <AddressField
            label="Destination"
            markerColor="var(--color-destination)"
            value={destination}
            onChange={onDestinationChange}
            picking={pickMode === 'destination'}
            onPick={() => onPickModeChange(pickMode === 'destination' ? null : 'destination')}
          />
        </div>
        <Button
          variant="icon"
          onClick={swap}
          disabled={!origin && !destination}
          aria-label="Swap start and destination"
          title="Swap start and destination"
        >
          <Icon name="swap" size={18} />
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={locate} disabled={locating} className="-ml-2">
          <Icon name="locate" size={16} />
          {locating ? 'Locating…' : 'Use my location'}
        </Button>
        {pickMode && (
          <span className="flex items-center gap-1.5 text-xs font-medium text-brand" aria-live="polite">
            <span className="h-1.5 w-1.5 animate-shimmer rounded-full bg-brand-accent" />
            Click the map to set the {pickMode === 'origin' ? 'start' : 'destination'}
          </span>
        )}
      </div>
      {locationError && (
        <p className="flex items-start gap-1.5 text-xs text-rose-700" role="alert">
          <Icon name="alert" size={14} className="mt-px shrink-0" />
          {locationError}
        </p>
      )}
    </section>
  )
}
