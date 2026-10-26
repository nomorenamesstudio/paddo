/**
 * Peer cursor labels. The other device is marked with an icon rather than a name:
 * in a one-reader app the useful fact is which machine is there, not who it is.
 *
 * Icons are lucide's monitor and smartphone (ISC), inlined as markup because the
 * caret label is built as a plain DOM node by y-prosemirror.
 */

const MONITOR = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"
     stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12" aria-hidden="true">
  <rect width="20" height="14" x="2" y="3" rx="2" />
  <line x1="8" x2="16" y1="21" y2="21" />
  <line x1="12" x2="12" y1="17" y2="21" />
</svg>`

const SMARTPHONE = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"
     stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12" aria-hidden="true">
  <rect width="14" height="20" x="5" y="2" rx="2" ry="2" />
  <path d="M12 18h.01" />
</svg>`

export type DeviceKind = 'desktop' | 'phone'

export function deviceKind(): DeviceKind {
  const coarse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches
  return coarse ? 'phone' : 'desktop'
}

const isDeviceKind = (value: unknown): value is DeviceKind => value === 'desktop' || value === 'phone'

/** Passed to the carets extension: identity plus how to draw the label. */
export function caretRenderer(user: Record<string, unknown>): HTMLElement {
  const caret = document.createElement('span')
  caret.classList.add('collaboration-carets__caret')

  const label = document.createElement('span')
  label.classList.add('collaboration-carets__label')
  const kind = user.device
  label.innerHTML = isDeviceKind(kind) && kind === 'phone' ? SMARTPHONE : MONITOR
  // Older clients still send a name; keep the label useful rather than empty.
  if (!isDeviceKind(kind) && typeof user.name === 'string') label.textContent = user.name

  caret.append(label)
  return caret
}
