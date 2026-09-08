/**
 * Brings a scrolling row back to its start when it has been scrolled, smoothly unless reduced
 * motion is set (DESIGN.md 8, Board order). A row already at its start is left alone.
 */
export function scrollRowBack(el: HTMLElement | null): void {
  if (!el || typeof el.scrollTo !== 'function' || el.scrollLeft === 0) return
  const reduced =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  el.scrollTo({ left: 0, behavior: reduced ? 'auto' : 'smooth' })
}
