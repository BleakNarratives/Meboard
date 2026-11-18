import { useSyncExternalStore } from "react"

/**
 * The viewport is an external system, not state this hook owns.
 *
 * The previous version set state from inside an effect, which paints the
 * desktop layout first and then corrects it — a visible flash on a phone, and
 * a cascading render for anyone reading the value during mount. Reading it as
 * an external store gives the right answer on the first paint and subscribes
 * only to the change that actually matters.
 *
 * The breakpoint query is rebuilt on subscribe rather than held in module
 * scope so nothing captures a stale `window` from a previous document.
 */
const MOBILE_BREAKPOINT = 768

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
  query.addEventListener("change", onChange)
  return () => query.removeEventListener("change", onChange)
}

function getSnapshot(): boolean {
  return window.innerWidth < MOBILE_BREAKPOINT
}

/** No window (prerender): assume the wide layout, which fails open. */
function getServerSnapshot(): boolean {
  return false
}

export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
