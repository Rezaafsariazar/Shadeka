import { useEffect, useRef } from 'react'
import { SHORTCUTS } from '../../hooks/useHudShortcuts'
import Icon from '../ui/Icon'

export default function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="shortcuts-title"
      className="hud-frame m-auto w-[min(92vw,420px)] rounded-sm bg-surface p-5 text-ink backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      <div className="mb-4 flex items-center justify-between">
        <h2 id="shortcuts-title" className="font-mono text-xs uppercase tracking-[0.2em] text-brand-ink">
          Keyboard shortcuts
        </h2>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-sm p-1 text-ink-muted hover:text-ink">
          <Icon name="close" size={18} />
        </button>
      </div>
      <dl className="flex flex-col gap-2.5">
        {SHORTCUTS.map(([key, action]) => (
          <div key={key} className="flex items-center justify-between gap-4 text-sm">
            <dt>
              <kbd className="rounded-sm border border-line bg-surface-muted px-2 py-0.5 font-mono text-xs text-ink">{key}</kbd>
            </dt>
            <dd className="text-ink-soft">{action}</dd>
          </div>
        ))}
      </dl>
    </dialog>
  )
}
