import { useEffect, useRef, useState } from 'react'

/**
 * The behaviour every small menu in Paddō shares: a trigger, a panel, a click
 * outside to close it and Escape for the keyboard.
 */
export function useMenu<T extends HTMLElement = HTMLDivElement>() {
  const [open, setOpen] = useState(false)
  const root = useRef<T | null>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return { open, setOpen, root }
}
