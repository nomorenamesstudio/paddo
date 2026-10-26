import { randomUUID } from 'node:crypto'

import * as Y from 'yjs'

import { CONTENT_FIELD } from '../shared/editor'
import { kindFor, SUGGESTIONS_MAP, type Suggestion, type SuggestionAuthor } from '../shared/suggestions'
import { anchorRange, flatten, locateQuote } from './anchors'
import { diffToHunks } from './diff'
import { yDocFromMarkdown } from './collab'

export interface ProposeEdit {
  original: string
  proposed: string
  rationale?: string
}

export interface EditError {
  index: number
  error: 'not-found' | 'ambiguous' | 'unchanged'
  message: string
}

export interface ProposeResult {
  created: Array<{ id: string; kind: Suggestion['kind']; original: string; proposed: string }>
  errors: EditError[]
}

export interface Transactor {
  transact(fn: (document: Y.Doc) => void): Promise<void>
}

/**
 * Pattern B, MCP flavour: the agent never writes the document. It copies text
 * out, sends hunks in, and the hunks become suggestions anchored to the live
 * CRDT state.
 */
export async function proposeEdits(
  connection: Transactor,
  edits: ProposeEdit[],
  author: SuggestionAuthor = 'agent',
): Promise<ProposeResult> {
  const result: ProposeResult = { created: [], errors: [] }

  await connection.transact((doc) => {
    const map = doc.getMap<Record<string, unknown>>(SUGGESTIONS_MAP)
    let flat = flatten(doc.getXmlFragment(CONTENT_FIELD))

    edits.forEach((edit, index) => {
      const original = edit.original ?? ''
      const proposed = edit.proposed ?? ''
      if (original.trim() === proposed.trim()) {
        result.errors.push({ index, error: 'unchanged', message: 'original and proposed are identical' })
        return
      }

      let from: Uint8Array | null
      let to: Uint8Array | null = null

      if (original === '') {
        // Insertion: `proposed` is placed at the start of an existing block, so
        // the caller must still supply a context quote.
        result.errors.push({
          index,
          error: 'not-found',
          message: 'a pure insertion needs an anchor; send the text it should follow as `original`',
        })
        return
      }

      const located = locateQuote(flat, original)
      if (!located.ok) {
        result.errors.push({
          index,
          error: located.error,
          message:
            located.error === 'not-found'
              ? 'that text is not in the document verbatim'
              : `that text appears ${located.matches.length} times; include more surrounding text`,
        })
        return
      }

      from = located.from
      to = located.to
      // Store the text that actually matched, so the editor can verify it later.
      const matchedOriginal = located.matched
      if (!from) {
        result.errors.push({ index, error: 'not-found', message: 'could not anchor that text' })
        return
      }

      const suggestion: Suggestion = {
        id: randomUUID(),
        kind: kindFor(matchedOriginal, proposed),
        from,
        to,
        original: matchedOriginal,
        proposed,
        rationale: edit.rationale?.trim() || null,
        status: 'pending',
        author,
        createdAt: Date.now(),
      }

      map.set(suggestion.id, suggestion as unknown as Record<string, unknown>)
      result.created.push({
        id: suggestion.id,
        kind: suggestion.kind,
        original: suggestion.original,
        proposed: suggestion.proposed,
      })

      // Later hunks in the same batch must not re-match text already targeted.
      flat = flatten(doc.getXmlFragment(CONTENT_FIELD))
    })
  })

  return result
}

/**
 * Free-form path (and the file watcher): diff a whole rewritten document
 * against the live one and turn every changed run into a suggestion.
 */
export async function proposeMarkdown(
  connection: Transactor,
  body: string,
  author: SuggestionAuthor = 'file',
): Promise<ProposeResult> {
  const result: ProposeResult = { created: [], errors: [] }

  await connection.transact((doc) => {
    const fragment = doc.getXmlFragment(CONTENT_FIELD)
    const before = flatten(fragment)
    const after = flatten(yDocFromMarkdown(body).getXmlFragment(CONTENT_FIELD))
    const hunks = diffToHunks(before.text, after.text)
    const map = doc.getMap<Record<string, unknown>>(SUGGESTIONS_MAP)

    if (hunks.length === 0) return

    for (const hunk of hunks) {
      const anchored = anchorRange(before, hunk.start, hunk.end)
      if (!anchored) {
        result.errors.push({ index: -1, error: 'not-found', message: 'could not anchor a hunk' })
        continue
      }
      const { from, to } = anchored

      const suggestion: Suggestion = {
        id: randomUUID(),
        kind: kindFor(hunk.original, hunk.proposed),
        from,
        to,
        original: hunk.original,
        proposed: hunk.proposed,
        rationale: null,
        status: 'pending',
        author,
        createdAt: Date.now(),
      }

      map.set(suggestion.id, suggestion as unknown as Record<string, unknown>)
      result.created.push({
        id: suggestion.id,
        kind: suggestion.kind,
        original: suggestion.original,
        proposed: suggestion.proposed,
      })
    }
  })

  return result
}
