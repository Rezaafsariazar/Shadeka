import type { ReactNode } from 'react'

interface SectionProps {
  title: string
  /** Right-aligned content in the title row (a value readout, a switch…). */
  aside?: ReactNode
  children: ReactNode
  className?: string
}

/** A titled group in the side panel; groups are separated by dividers rather than boxed in cards. */
export default function Section({ title, aside, children, className = '' }: SectionProps) {
  return (
    <section aria-label={title} className={`flex flex-col gap-3 border-t border-line-soft py-5 ${className}`}>
      <div className="flex min-h-6 items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  )
}
