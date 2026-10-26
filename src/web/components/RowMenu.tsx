import { useEffect, useRef, useState } from 'react'
import { Archive, ArchiveRestore, MoreVertical, Trash2 } from 'lucide-react'

import { api, type DocumentMeta } from '../api'

/**
 * The per-document actions. Archive is a status change, so it is reversible;
 * delete is not, so it asks once, in place, and forgets the question after a few
 * seconds.
 */
export function RowMenu({
  entry,
  onChanged,
}: {
  entry: DocumentMeta
  onChanged: () => void
}) {
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
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

  useEffect(() => {
    if (!confirming) return
    const timer = window.setTimeout(() => setConfirming(false), 4000)
    return () => window.clearTimeout(timer)
  }, [confirming])

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true)
    try {
      await action()
      setOpen(false)
      setConfirming(false)
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="row-menu" ref={root}>
      <button
        type="button"
        className="button button--ghost button--icon row-menu__trigger"
        onClick={() => {
          setOpen((current) => !current)
          setConfirming(false)
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions for ${entry.title}`}
        title="Actions"
      >
        <MoreVertical size={18} aria-hidden="true" />
      </button>

      {open ? (
        <div className="row-menu__panel" role="menu" aria-label={`Actions for ${entry.title}`}>
          {entry.status === 'archived' ? (
            <button
              type="button"
              role="menuitem"
              className="row-menu__item"
              disabled={busy}
              onClick={() => void run(() => api.setStatus(entry.slug, 'draft'))}
            >
              <ArchiveRestore size={16} aria-hidden="true" />
              <span>Restore</span>
            </button>
          ) : (
            <button
              type="button"
              role="menuitem"
              className="row-menu__item"
              disabled={busy}
              onClick={() => void run(() => api.setStatus(entry.slug, 'archived'))}
            >
              <Archive size={16} aria-hidden="true" />
              <span>Archive</span>
            </button>
          )}

          <button
            type="button"
            role="menuitem"
            className={`row-menu__item row-menu__item--danger${confirming ? ' is-confirming' : ''}`}
            disabled={busy}
            onClick={() => {
              if (!confirming) {
                setConfirming(true)
                return
              }
              void run(() => api.deleteDocument(entry.slug))
            }}
          >
            <Trash2 size={16} aria-hidden="true" />
            <span>{confirming ? 'Delete for good' : 'Delete'}</span>
          </button>
        </div>
      ) : null}
    </div>
  )
}
