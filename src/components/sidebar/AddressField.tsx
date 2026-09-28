import { useId } from 'react'
import type { LatLon } from '../../lib/api'
import { useAddressField } from '../../hooks/useAddressField'
import Icon from '../ui/Icon'

interface AddressFieldProps {
  label: string
  markerColor: string
  value: LatLon | null
  onChange: (v: LatLon | null) => void
  picking: boolean
  onPick: () => void
}

/** Address/coordinate search with autocomplete (combobox pattern) plus a pick-on-map toggle. */
export default function AddressField({ label, markerColor, value, onChange, picking, onPick }: AddressFieldProps) {
  const field = useAddressField(value, onChange)
  const id = useId()
  const listId = `${id}-list`
  const showList = field.open && field.suggestions.length > 0

  return (
    <div className="relative">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <div
        className={`flex h-11 items-center gap-2 rounded-(--radius-control) border bg-surface pl-3 pr-1 transition-[border-color,box-shadow] duration-200 focus-within:border-brand-accent focus-within:ring-4 focus-within:ring-teal-500/15 ${
          field.error ? 'border-rose-300' : 'border-line'
        }`}
      >
        <span className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white" style={{ backgroundColor: markerColor }} />
        <input
          id={id}
          type="text"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={field.activeIndex >= 0 ? `${listId}-${field.activeIndex}` : undefined}
          aria-invalid={field.error ? true : undefined}
          placeholder={`${label}: search an address`}
          value={field.text}
          onChange={(e) => field.handleTextChange(e.target.value)}
          onFocus={() => field.setOpen(true)}
          onBlur={() => setTimeout(field.commit, 120)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' && field.suggestions.length > 0) {
              e.preventDefault()
              field.setOpen(true)
              field.setActiveIndex((field.activeIndex + 1) % field.suggestions.length)
            } else if (e.key === 'ArrowUp' && field.suggestions.length > 0) {
              e.preventDefault()
              field.setActiveIndex((field.activeIndex - 1 + field.suggestions.length) % field.suggestions.length)
            } else if (e.key === 'Escape') {
              field.setOpen(false)
            } else if (e.key === 'Enter') {
              ;(e.target as HTMLInputElement).blur()
            }
          }}
          className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted focus-visible:outline-none"
        />
        {field.text && (
          <button
            type="button"
            onClick={field.clear}
            aria-label={`Clear ${label.toLowerCase()}`}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink-soft"
          >
            <Icon name="close" size={16} />
          </button>
        )}
        <button
          type="button"
          onClick={onPick}
          aria-pressed={picking}
          title={`Choose ${label.toLowerCase()} on the map`}
          aria-label={`Choose ${label.toLowerCase()} on the map`}
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors ${
            picking ? 'bg-brand text-white' : 'text-ink-muted hover:bg-surface-sunken hover:text-ink-soft'
          }`}
        >
          <Icon name="pin" size={18} />
        </button>
      </div>

      {field.error && (
        <p className="mt-1.5 flex items-start gap-1.5 text-xs text-rose-700" role="alert">
          <Icon name="alert" size={14} className="mt-px shrink-0" />
          {field.error}
        </p>
      )}
      {field.searching && !field.error && <p className="mt-1.5 text-xs text-ink-muted">Searching…</p>}

      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label={`${label} suggestions`}
          className="absolute left-0 right-0 top-full z-30 mt-1.5 max-h-60 overflow-y-auto rounded-xl border border-line bg-surface p-1 shadow-(--shadow-overlay) animate-enter"
        >
          {field.suggestions.map((s, i) => (
            <li
              key={s.label}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === field.activeIndex}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => field.selectSuggestion(s)}
              className={`flex cursor-pointer items-start gap-2 rounded-lg px-2.5 py-2 text-sm text-ink-soft ${
                i === field.activeIndex ? 'bg-brand-soft text-ink' : 'hover:bg-surface-sunken'
              }`}
            >
              <Icon name="pin" size={16} className="mt-0.5 shrink-0 text-ink-muted" />
              <span className="line-clamp-2">{s.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
