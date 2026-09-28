import { useEffect, useRef } from 'react'
import { timeStore } from '../lib/timeStore'
import { TIME_STEP } from '../lib/time'

export interface ShortcutHandlers {
  setView: (mode: '2d' | '3d') => void
  replayFlythrough: () => void
  exit: () => void
  toggleHelp: () => void
}

export const SHORTCUTS: [string, string][] = [
  ['Space', 'Play / pause the time-lapse'],
  ['← →', 'Time −/+ 5 minutes'],
  ['Shift ← →', 'Time −/+ 1 hour'],
  ['2 / 3', '2D map / 3D city'],
  ['F', 'Fly the route (3D)'],
  ['?', 'Show these shortcuts'],
  ['Esc', 'Back to the planner'],
]

/**
 * Page-level keyboard shortcuts. Ignored while typing in a field and when a
 * focused control already uses the key (sliders, radio groups), so they
 * never fight normal keyboard use.
 */
export function useHudShortcuts(handlers: ShortcutHandlers) {
  const ref = useRef(handlers)
  useEffect(() => {
    ref.current = handlers
  })

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const target = e.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [role="radiogroup"], [contenteditable="true"]')) return
      const h = ref.current
      const step = e.shiftKey ? 60 : TIME_STEP
      // In 3D walk mode the arrow keys move the camera.
      const walking = document.querySelector('[data-camera-mode="walk"]') !== null
      switch (e.key) {
        case ' ':
          if (target?.closest('button')) return
          e.preventDefault()
          timeStore.togglePlay()
          break
        case 'ArrowLeft':
          if (walking) return
          e.preventDefault()
          timeStore.pause()
          timeStore.setTarget(timeStore.getTarget() - step)
          break
        case 'ArrowRight':
          if (walking) return
          e.preventDefault()
          timeStore.pause()
          timeStore.setTarget(timeStore.getTarget() + step)
          break
        case '2':
          h.setView('2d')
          break
        case '3':
          h.setView('3d')
          break
        case 'f':
        case 'F':
          h.setView('3d')
          h.replayFlythrough()
          break
        case '?':
          h.toggleHelp()
          break
        case 'Escape':
          h.exit()
          break
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
