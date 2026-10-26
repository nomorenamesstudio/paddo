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

/** The state of a document, as one mark: a page, a pen, a globe, a box. */
export function StatusIcon({ status, size = 15 }: { status: Status; size?: number }) {
  const Icon = ICONS[status]
  return <Icon size={size} className={`status-icon status-icon--${status}`} aria-hidden="true" />
}
