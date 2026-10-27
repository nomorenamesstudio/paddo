import { CircleCheck, CircleX, Loader2 } from 'lucide-react'

import type { SyncState } from './TopBar'

/** How the writing UI's header announces itself, in order. */
export type HeadlinePhase = 'loading' | 'synced' | 'title'

const ORDER: HeadlinePhase[] = ['loading', 'synced', 'title']

function SyncMark({ state }: { state: SyncState }) {
  if (state === 'connected') return <CircleCheck size={17} aria-hidden="true" />
  if (state === 'connecting') return <Loader2 size={16} className="spin" aria-hidden="true" />
  return <CircleX size={17} aria-hidden="true" />
}

/**
 * One line of header text at a time, sliding: the old one leaves upwards while the new
 * one rises from below, and the sheet clips both. All three states stay mounted so the
 * movement is a CSS transition rather than a mount/unmount race.
 */
export function Headline({
  phase,
  title,
  sync,
}: {
  phase: HeadlinePhase
  title: string
  sync: SyncState
}) {
  const current = ORDER.indexOf(phase)

  const placement = (index: number) =>
    index < current ? 'after' : index === current ? 'current' : 'before'

  const hidden = (index: number) => (placement(index) === 'current' ? undefined : true)

  return (
    <div className="headline" aria-live="polite" aria-atomic="true">
      <div
        className="headline__layer headline__layer--status"
        data-state={placement(0)}
        aria-hidden={hidden(0)}
      >
        <Loader2 size={16} className="spin" aria-hidden="true" />
        <span>loading document</span>
      </div>

      <div
        className="headline__layer headline__layer--status headline__layer--synced"
        data-state={placement(1)}
        aria-hidden={hidden(1)}
      >
        <CircleCheck size={17} aria-hidden="true" />
        <span>synced</span>
      </div>

      <div
        className="headline__layer headline__layer--title"
        data-state={placement(2)}
        aria-hidden={hidden(2)}
      >
        <h1 className="topbar__title">{title}</h1>
        <span className="headline__sync">
          <SyncMark state={sync} />
        </span>
      </div>
    </div>
  )
}
