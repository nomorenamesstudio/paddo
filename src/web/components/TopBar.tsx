import type { MouseEvent, ReactNode } from 'react'
import { Check, ChevronLeft, RefreshCw, X } from 'lucide-react'

import { navigate } from '../App'

export type SyncState = 'connecting' | 'connected' | 'disconnected'

function SyncIcon({ state }: { state: SyncState }) {
  return (
    <span
      className={`sync-icon sync-icon--${state}`}
      title={`sync: ${state}`}
      role="status"
      aria-label={`sync: ${state}`}
    >
      {state === 'connected' ? (
        <Check size={16} aria-hidden="true" />
      ) : state === 'connecting' ? (
        <RefreshCw size={16} aria-hidden="true" className="spin" />
      ) : (
        <X size={16} aria-hidden="true" />
      )}
    </span>
  )
}

/** Empty controls of the same size, so nothing shifts when the real ones arrive. */
export function TopBarActionsPlaceholder() {
  return (
    <span className="topbar__actions" aria-hidden="true">
      <span className="button button--ghost button--icon status-placeholder" />
      <span className="button button--ghost button--icon" />
    </span>
  )
}

/**
 * One top bar for the loading state and the loaded one. The title and the right
 * hand controls keep their space while the document arrives, so the sync icon
 * does not jump sideways when the buttons mount.
 */
export function TopBar({
  title,
  sync,
  actions,
}: {
  title: string
  sync: SyncState
  actions?: ReactNode
}) {
  return (
    <header className="topbar">
      <a
        className="topbar__back"
        href="/"
        aria-label="All documents"
        title="All documents"
        onClick={(event: MouseEvent<HTMLAnchorElement>) => {
          // Client-side, so leaving never waits for the editor bundle or the socket.
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
          event.preventDefault()
          navigate('/')
        }}
      >
        <ChevronLeft size={22} aria-hidden="true" />
      </a>
      <h1 className="topbar__title">{title}</h1>
      <SyncIcon state={sync} />
      {actions ?? <TopBarActionsPlaceholder />}
    </header>
  )
}
