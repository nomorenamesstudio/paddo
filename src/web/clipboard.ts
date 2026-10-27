/**
 * Copying without assuming a secure context.
 *
 * `navigator.clipboard` only exists on HTTPS and localhost, and Paddō is often
 * reached over plain LAN HTTP from a phone. The old selection trick still works
 * there, inside the click's user gesture.
 */
export async function copyText(text: string): Promise<boolean> {
  if (window.isSecureContext && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Permission denied or no clipboard: fall through to the selection trick.
    }
  }

  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.top = '0'
  area.style.left = '0'
  area.style.opacity = '0'
  document.body.appendChild(area)
  area.select()
  area.setSelectionRange(0, text.length)

  let copied = false
  try {
    copied = document.execCommand('copy')
  } catch {
    copied = false
  } finally {
    document.body.removeChild(area)
  }
  return copied
}

/**
 * Last resort when copying is refused outright: select the text and let the reader
 * copy it with the keyboard or a long press.
 */
export function selectElementText(element: HTMLElement | null): boolean {
  if (!element) return false
  const range = document.createRange()
  range.selectNodeContents(element)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
  return Boolean(selection && selection.toString().length > 0)
}
