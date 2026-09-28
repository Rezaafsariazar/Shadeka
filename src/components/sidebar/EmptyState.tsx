const STEPS = [
  'Search a start address, or click the map.',
  'Add your destination the same way.',
  'Slide from fastest to shadiest, and pick a time.',
]

/** First-run guidance, shown until a route exists. */
export default function EmptyState() {
  return (
    <section aria-label="How it works" className="rounded-xl bg-brand-soft/70 p-4 animate-enter">
      <p className="text-sm font-semibold text-ink">Plan a walk in the shade</p>
      <ol className="mt-2 flex flex-col gap-1.5">
        {STEPS.map((step, i) => (
          <li key={step} className="flex items-start gap-2.5 text-sm text-ink-soft">
            <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-semibold text-brand ring-1 ring-teal-600/20">
              {i + 1}
            </span>
            {step}
          </li>
        ))}
      </ol>
    </section>
  )
}
