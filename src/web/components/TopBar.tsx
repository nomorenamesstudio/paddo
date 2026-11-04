import type { MouseEvent, ReactNode } from 'react'
import { ChevronLeft } from 'lucide-react'

import { Headline, type HeadlinePhase } from './Headline'

import { navigate } from '../App'
import { url } from '../base'

export type SyncState = 'connecting' | 'connected' | 'disconnected'

/** Empty controls of the same size, so nothing shifts when the real ones arrive. */
export function TopBarActionsPlaceholder() {
  return (
    <span className="topbar__actions" aria-hidden="true">
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
  phase,
}: {
  title: string
  sync: SyncState
  actions?: ReactNode
  /** Writing UI only: the header states from loading to the title. */
  phase?: HeadlinePhase
}) {
  return (
    <header className="topbar">
      <a
        className="topbar__back"
        href={url()}
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
      {/* Title and sync state travel together: the state belongs to this document,
          not to the row of controls on the right. */}
      {phase ? (
        <Headline phase={phase} title={title} />
      ) : (
        <div className="topbar__heading">
          <h1 className="topbar__title">{title}</h1>
        </div>
      )}
      {actions ?? <TopBarActionsPlaceholder />}
    </header>
  )
}
