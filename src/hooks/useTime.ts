import { useEffect, useState, useSyncExternalStore } from 'react'
import { timeStore, type PlaybackState } from '../lib/timeStore'

/** The selected time (minutes), for the slider thumb and HH:MM readout. */
export function useTimeTarget(): number {
  return useSyncExternalStore(timeStore.subscribeTarget, timeStore.getTarget)
}

/** The smoothed, per-frame time the sun is actually rendered at. */
export function useDisplayTime(): number {
  return useSyncExternalStore(timeStore.subscribeDisplay, timeStore.getDisplay)
}

export function usePlayback(): PlaybackState {
  return useSyncExternalStore(timeStore.subscribePlayback, timeStore.getPlayback)
}

/**
 * The selected time once it has stopped changing for `delayMs` (and playback
 * is paused) — what network work (route, weather) should key off, so a drag
 * or a running time-lapse never fires a request per tick.
 */
export function useSettledTime(delayMs = 300): number {
  const [settled, setSettled] = useState(timeStore.getTarget)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const schedule = () => {
      clearTimeout(timer)
      if (timeStore.isPlaying()) return
      timer = setTimeout(() => setSettled(timeStore.getTarget()), delayMs)
    }
    const unsubscribeTarget = timeStore.subscribeTarget(schedule)
    const unsubscribePlayback = timeStore.subscribePlayback(schedule)
    return () => {
      clearTimeout(timer)
      unsubscribeTarget()
      unsubscribePlayback()
    }
  }, [delayMs])

  return settled
}
