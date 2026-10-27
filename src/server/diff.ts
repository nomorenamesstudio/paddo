import { diffWordsWithSpace } from 'diff'

export interface TextHunk {
  /** Offset in the old text, inclusive. */
  start: number
  /** Offset in the old text, exclusive. */
  end: number
  original: string
  proposed: string
}

/**
 * Word-level diff of two flattened texts, collapsed into hunks.
 *
 * Two changes separated by a short unchanged run belong to one hunk, but the
 * unchanged text between them is only pulled in when another change follows —
 * otherwise every hunk would drag the rest of the paragraph along with it.
 */
export function diffToHunks(oldText: string, newText: string, mergeGap = 12): TextHunk[] {
  const parts = diffWordsWithSpace(oldText, newText)
  const hunks: TextHunk[] = []

  let oldPos = 0
  let pending: TextHunk | null = null
  let tail: { text: string; start: number } | null = null

  /** Unchanged text between two changes joins the hunk, on both sides. */
  const commitTail = () => {
    if (!pending || !tail) return
    pending.original += tail.text
    pending.proposed += tail.text
    pending.end = tail.start + tail.text.length
    tail = null
  }

  const flush = () => {
    if (!pending) return
    // A difference in whitespace alone is never worth a hunk: an editor keeps an
    // empty paragraph in the CRDT, and the file does not, which would otherwise show
    // up as a suggestion that deletes two newlines.
    if (pending.original !== pending.proposed && pending.original.trim() !== pending.proposed.trim()) {
      hunks.push(pending)
    }
    pending = null
    tail = null
  }

  for (const part of parts) {
    if (part.removed) {
      pending ??= { start: oldPos, end: oldPos, original: '', proposed: '' }
      commitTail()
      pending.original += part.value
      oldPos += part.value.length
      pending.end = oldPos
      continue
    }

    if (part.added) {
      pending ??= { start: oldPos, end: oldPos, original: '', proposed: '' }
      commitTail()
      pending.proposed += part.value
      continue
    }

    const start = oldPos
    oldPos += part.value.length
    if (!pending) continue

    tail = tail ? { text: tail.text + part.value, start: tail.start } : { text: part.value, start }
    if (tail.text.length > mergeGap) flush()
  }

  flush()
  return hunks
}
