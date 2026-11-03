import { useSyncExternalStore } from 'react'

export type Page = 'planner' | 'command'

// Hash routing: a static host (nginx serving index.html) needs no rewrite
// rules, and the browser's back button and shareable links still work.
const COMMAND_HASH = '#/command'

function subscribe(onChange: () => void) {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

function getPage(): Page {
  return window.location.hash === COMMAND_HASH ? 'command' : 'planner'
}

export function useHashRoute(): Page {
  return useSyncExternalStore(subscribe, getPage)
}

export function navigate(page: Page) {
  window.location.hash = page === 'command' ? COMMAND_HASH : '#/'
}
