/**
 * The camera (DESIGN.md 8, Board order): the small scrolls that keep the action in view on a
 * phone. Every move is smooth unless reduced motion is set, in which case it is instant and the
 * waits are skipped. The timings are screen timings, not game rules, so they live here.
 */

/** How long a reveal may take before the move it leads goes ahead anyway, in ms. */
export const REVEAL_MS = 400
/** The beat between the end of the viewer's turn and the rows returning to their start, in ms. */
export const TURN_END_RESET_MS = 600

function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Brings a scrolling row back to its start when it has been scrolled; a row at its start is left alone. */
export function scrollRowBack(el: HTMLElement | null): void {
  if (!el || typeof el.scrollTo !== 'function' || el.scrollLeft === 0) return
  el.scrollTo({ left: 0, behavior: reducedMotion() ? 'auto' : 'smooth' })
}

function inView(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect()
  return rect.top >= 0 && rect.bottom <= window.innerHeight
}

/**
 * Brings an element into view, then calls `done`: on the next tick when it is already in view
 * or under reduced motion, otherwise when the scroll ends or after REVEAL_MS, whichever comes
 * first. Returns a function that cancels the call.
 */
export function reveal(el: HTMLElement | null, done?: () => void): () => void {
  let settled = false
  let timer: ReturnType<typeof setTimeout> | undefined
  function onEnd() {
    settle(true)
  }
  function settle(call: boolean) {
    if (settled) return
    settled = true
    if (timer !== undefined) clearTimeout(timer)
    if (typeof document !== 'undefined') document.removeEventListener('scrollend', onEnd)
    if (call) done?.()
  }
  const cancel = () => settle(false)
  if (!el || typeof el.scrollIntoView !== 'function' || inView(el)) {
    timer = setTimeout(onEnd, 0)
    return cancel
  }
  const reduced = reducedMotion()
  el.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' })
  if (reduced) {
    timer = setTimeout(onEnd, 0)
    return cancel
  }
  document.addEventListener('scrollend', onEnd)
  timer = setTimeout(onEnd, REVEAL_MS)
  return cancel
}

/** Opens the page at its top, at once: a new view has nothing to animate from. */
export function scrollPageTop(): void {
  if (typeof window === 'undefined' || typeof window.scrollTo !== 'function') return
  if (window.scrollY > 0) window.scrollTo({ top: 0, behavior: 'auto' })
}

/** Brings a scrolling panel back to its own top, at once. */
export function scrollPanelTop(el: HTMLElement | null): void {
  if (el && el.scrollTop > 0) el.scrollTop = 0
}
