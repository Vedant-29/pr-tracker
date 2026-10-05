import { useSyncExternalStore } from 'react'

/* Does this device have a real pointer — a mouse or trackpad, not a finger?

   Touch screens synthesise `mouseenter` on tap but never fire `mouseleave`
   until something else is tapped, so anything driven by hover gets stuck on
   screen. Gating the whole affordance on pointer capability kills that class
   of bug outright, rather than patching each handler. */
const QUERY = '(hover: hover) and (pointer: fine)'

let mql: MediaQueryList | undefined

function query(): MediaQueryList {
  return (mql ??= window.matchMedia(QUERY))
}

function subscribe(onChange: () => void): () => void {
  const m = query()
  m.addEventListener('change', onChange)
  return () => m.removeEventListener('change', onChange)
}

const getSnapshot = () => query().matches

/* False during the build-time render and through hydration so the markup
   matches; React re-reads the live value immediately afterwards. */
const getServerSnapshot = () => false

export function useHasHover(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
