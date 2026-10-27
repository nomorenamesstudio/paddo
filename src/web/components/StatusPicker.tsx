import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'

import { STATUSES, type Status } from '../api'
import { StatusIcon, statusLabel } from './StatusIcon'

/** Status as an icon button with a small menu, because the words said nothing. */
export function StatusPicker({ value, onChange }: { value: Status; onChange: (next: Status) => void }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement | null>(null)

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

  return (
    <div className="status" ref={root}>
      <button
        type="button"
        className="button button--ghost button--icon"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Status: ${statusLabel(value)}`}
        title={`Status: ${statusLabel(value)}`}
      >
        {/* In the bar it is one quiet control among the others; the menu is where the
            current status is marked. */}
        <StatusIcon status={value} size={18} />
        <ChevronDown size={12} className="status__caret" aria-hidden="true" />
      </button>

      {open ? (
        <div className="status__menu" role="menu" aria-label="Document status">
          {STATUSES.map((status) => (
            <button
              key={status}
              type="button"
              role="menuitemradio"
              aria-checked={status === value}
              className={`status__item${status === value ? ' is-active' : ''}`}
              onClick={() => {
                setOpen(false)
                if (status !== value) onChange(status)
              }}
            >
              <StatusIcon status={status} size={16} current={status === value} />
              <span>{statusLabel(status)}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
