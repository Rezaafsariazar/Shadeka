// Time of day is modeled as minutes since local midnight (e.g. 870 = 14:30)
// rather than fractional hours: Date#setHours truncates fractional hours
// (setHours(14.5) is 14:00), which silently snapped the sun to whole hours.

export const TIME_MIN = 6 * 60
export const TIME_MAX = 21 * 60
export const TIME_STEP = 5
export const DEFAULT_TIME = 14 * 60

/** Today's local date at `minutes` past midnight; fractional minutes are kept (for smooth animation). */
export function dateAtMinutes(minutes: number): Date {
  const midnight = new Date()
  midnight.setHours(0, 0, 0, 0)
  return new Date(midnight.getTime() + minutes * 60_000)
}

export function isoAtMinutes(minutes: number): string {
  return dateAtMinutes(minutes).toISOString()
}

/** "HH:MM", rounded to the nearest minute. */
export function formatMinutes(minutes: number): string {
  const total = Math.round(minutes)
  const h = Math.floor(total / 60)
  const m = total % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
