import { useEffect, useRef, useState } from 'react'
import { geocodeAddress, type GeocodeResult, type LatLon } from '../lib/api'
import { formatCoords, parseLatLon } from '../lib/format'

/**
 * Drives one address field's text/suggestions/error state. Kept fully
 * controlled (rather than a defaultValue+remount trick) so a selected
 * geocode result's human-readable label can stay on screen instead of
 * immediately reformatting back to raw coordinates once the parent's
 * `value` prop round-trips through onChange.
 */
export function useAddressField(value: LatLon | null, onChange: (v: LatLon | null) => void) {
  const [text, setText] = useState(formatCoords(value))
  const [suggestions, setSuggestions] = useState<GeocodeResult[]>([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  // Set right before an onChange we triggered ourselves (selecting a
  // suggestion, or committing a typed "lat, lon"), so the sync effect below
  // doesn't stomp our just-set display text when `value` round-trips back.
  const justSetRef = useRef(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    if (justSetRef.current) {
      justSetRef.current = false
      return
    }
    setText(formatCoords(value))
    setError(null)
    setSuggestions([])
  }, [value])

  function handleTextChange(next: string) {
    setText(next)
    setError(null)
    setOpen(true)
    setActiveIndex(-1)
    clearTimeout(debounceRef.current)

    if (parseLatLon(next) || next.trim().length < 3) {
      setSuggestions([])
      return
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        setSuggestions(await geocodeAddress(next))
      } catch {
        setSuggestions([])
      } finally {
        setSearching(false)
      }
    }, 350)
  }

  function selectSuggestion(s: GeocodeResult) {
    justSetRef.current = true
    setText(s.label)
    setSuggestions([])
    setOpen(false)
    setActiveIndex(-1)
    onChange(s.point)
  }

  function commit() {
    setOpen(false)
    const trimmed = text.trim()
    if (trimmed.length === 0) {
      onChange(null)
      setError(null)
      return
    }
    const parsed = parseLatLon(trimmed)
    if (parsed) {
      justSetRef.current = true
      onChange(parsed)
      setText(formatCoords(parsed))
      return
    }
    if (suggestions.length > 0) {
      selectSuggestion(suggestions[activeIndex >= 0 ? activeIndex : 0])
      return
    }
    setError('No match in Karlsruhe. Try another search, or pick the point on the map.')
  }

  function clear() {
    setText('')
    setSuggestions([])
    setError(null)
    onChange(null)
  }

  return {
    text,
    suggestions,
    searching,
    error,
    open,
    setOpen,
    activeIndex,
    setActiveIndex,
    handleTextChange,
    selectSuggestion,
    commit,
    clear,
  }
}
