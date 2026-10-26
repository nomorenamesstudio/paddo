/**
 * The suggestion record shared by the server (which creates them), the editor
 * (which renders and resolves them) and the MCP layer (which reports on them).
 * Stored as plain objects in a `Y.Map` on the document room.
 */

export const SUGGESTIONS_MAP = 'suggestions'

export type SuggestionKind = 'replace' | 'insert' | 'delete'
export type SuggestionStatus = 'pending' | 'accepted' | 'rejected'
export type SuggestionAuthor = 'agent' | 'file'

export interface Suggestion {
  id: string
  kind: SuggestionKind
  /** Encoded Yjs relative position, start of the affected range. */
  from: Uint8Array
  /** Encoded relative position just after the range; null for a pure insert. */
  to: Uint8Array | null
  original: string
  proposed: string
  rationale: string | null
  status: SuggestionStatus
  author: SuggestionAuthor
  createdAt: number
}

export function kindFor(original: string, proposed: string): SuggestionKind {
  if (original === '') return 'insert'
  if (proposed === '') return 'delete'
  return 'replace'
}
