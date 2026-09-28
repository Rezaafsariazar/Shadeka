import type { ReactNode } from 'react'

export default function BrandHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-600 to-teal-700 shadow-sm">
          <svg viewBox="0 0 32 32" className="h-7 w-7" fill="none" aria-hidden="true">
            <ellipse cx="16" cy="26" rx="9" ry="2.6" fill="white" fillOpacity="0.3" />
            <rect x="14.6" y="17" width="2.8" height="9" rx="1.2" fill="white" />
            <circle cx="16" cy="12" r="8" fill="white" />
            <circle cx="24.5" cy="5.5" r="2.6" fill="#fde68a" />
          </svg>
        </div>
        <div className="min-w-0">
          <h1 className="text-lg font-bold leading-tight tracking-tight text-ink">
            Shade<span className="text-brand-ink">KA</span>
          </h1>
          <p className="truncate text-xs text-ink-muted">Shaded walks in Karlsruhe</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </header>
  )
}
