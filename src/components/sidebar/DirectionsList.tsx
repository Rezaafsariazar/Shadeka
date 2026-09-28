import type { DirectionStep } from '../../lib/directions'
import { formatDistance } from '../../lib/format'
import Icon, { type IconName } from '../ui/Icon'
import Section from './Section'

function stepIcon(instruction: string): IconName {
  if (instruction.startsWith('Arrive')) return 'flag'
  if (instruction.includes('left')) return 'turn-left'
  if (instruction.includes('right')) return 'turn-right'
  return 'arrow-up'
}

export default function DirectionsList({ steps }: { steps: DirectionStep[] }) {
  return (
    <Section title="Directions">
      <ol className="flex flex-col">
        {steps.map((step, i) => (
          <li key={i} className="flex items-center gap-3 border-b border-line-soft py-2.5 last:border-b-0">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-sunken text-ink-soft">
              <Icon name={stepIcon(step.instruction)} size={16} />
            </span>
            <span className="min-w-0 flex-1 text-sm text-ink-soft">{step.instruction}</span>
            {step.distanceM > 0 && (
              <span className="shrink-0 text-xs tabular-nums text-ink-muted">{formatDistance(step.distanceM)}</span>
            )}
          </li>
        ))}
      </ol>
    </Section>
  )
}
