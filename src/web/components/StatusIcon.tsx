import { Archive, FileText, Globe, PenLine } from 'lucide-react'

import type { Status } from '../api'

const ICONS = {
  draft: FileText,
  editing: PenLine,
  published: Globe,
  archived: Archive,
} as const

const LABELS: Record<Status, string> = {
  draft: 'Draft',
  editing: 'Editing',
  published: 'Published',
  archived: 'Archived',
}

export function statusLabel(status: Status): string {
  return LABELS[status]
}

/**
 * The state of a document, as one mark: a page, a pen, a globe, a box. The mark is
 * neutral ink — a status is metadata, not a signal — except when `current` says it is
 * the one the document is in.
 */
export function StatusIcon({
  status,
  size = 15,
  current = false,
}: {
  status: Status
  size?: number
  current?: boolean
}) {
  const Icon = ICONS[status]
  return (
    <Icon
      size={size}
      className={`status-icon status-icon--${status}${current ? ' status-icon--current' : ''}`}
      aria-hidden="true"
    />
  )
}
