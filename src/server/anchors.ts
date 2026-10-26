import * as Y from 'yjs'

/**
 * Anchors are Yjs relative positions built against the `Y.XmlText` that holds
 * the quoted characters — the same kind y-prosemirror builds internally, so a
 * browser client resolves ours with its own binding mapping while the server
 * never needs a ProseMirror position at all.
 */

export interface FlatText {
  text: string
  /** For every character of `text`: where it lives, or null for a separator. */
  chars: Array<{ node: Y.XmlText; index: number } | null>
}

/**
 * The document's visible text in order, with paragraph breaks as separators so
 * a quote cannot accidentally match across two unrelated blocks.
 */
export function flatten(fragment: Y.XmlFragment): FlatText {
  const out: FlatText = { text: '', chars: [] }
  walk(fragment, out, 0)
  return out
}

function pushSeparator(out: FlatText, separator: string) {
  for (const char of separator) {
    out.text += char
    out.chars.push(null)
  }
}

function walk(node: Y.XmlFragment | Y.XmlElement, out: FlatText, depth: number) {
  const children = node.toArray()
  children.forEach((child, position) => {
    if (position > 0) pushSeparator(out, depth === 0 ? '\n\n' : '\n')
    if (child instanceof Y.XmlText) {
      const value = child.toString()
      for (let index = 0; index < value.length; index += 1) {
        out.text += value[index]
        out.chars.push({ node: child, index })
      }
      return
    }
    if (child instanceof Y.XmlElement) walk(child, out, depth + 1)
  })
}

export function encodeAt(flat: FlatText, offset: number, assoc: 0 | -1): Uint8Array | null {
  const at = flat.chars[offset]
  if (!at) return null
  return Y.encodeRelativePosition(Y.createRelativePositionFromTypeIndex(at.node, at.index, assoc))
}

/**
 * Anchors a [start, end) range of the flat text, tolerating the two awkward
 * boundaries a diff produces: the very end of the document, and a position that
 * falls on a paragraph separator.
 */
export function anchorRange(flat: FlatText, start: number, end: number): { from: Uint8Array; to: Uint8Array } | null {
  const lastReal = (() => {
    for (let index = flat.chars.length - 1; index >= 0; index -= 1) {
      if (flat.chars[index]) return index
    }
    return -1
  })()
  if (lastReal === -1) return null

  const startAt = Math.min(start, lastReal + 1)
  const endExclusive = Math.min(Math.max(end, startAt), lastReal + 1)

  const from =
    flat.chars[startAt] !== undefined && flat.chars[startAt] !== null
      ? encodeAt(flat, startAt, 0)
      : startAt > lastReal
        ? encodeAt(flat, lastReal, -1)
        : findForward(flat, startAt, 0)

  const lastIndex = endExclusive - 1
  const to =
    lastIndex >= 0 && flat.chars[lastIndex]
      ? Y.encodeRelativePosition(
          Y.createRelativePositionFromTypeIndex(
            (flat.chars[lastIndex] as { node: Y.XmlText; index: number }).node,
            (flat.chars[lastIndex] as { node: Y.XmlText; index: number }).index + 1,
            -1,
          ),
        )
      : encodeAt(flat, lastReal, -1)

  if (!from || !to) return null
  return { from, to }
}

function findForward(flat: FlatText, offset: number, assoc: 0 | -1): Uint8Array | null {
  for (let index = offset; index < flat.chars.length; index += 1) {
    if (flat.chars[index]) return encodeAt(flat, index, assoc)
  }
  return null
}

export type LocateResult =
  | { ok: true; from: Uint8Array; to: Uint8Array; matched: string }
  | { ok: false; error: 'not-found' | 'ambiguous'; matches: number[] }

/** Whitespace-collapsed copy of the flat text, with a map back to its offsets. */
function collapse(flat: FlatText): { text: string; offsets: number[] } {
  let text = ''
  const offsets: number[] = []
  let lastWasSpace = false

  for (let index = 0; index < flat.text.length; index += 1) {
    const char = flat.text[index] as string
    if (/\s/.test(char)) {
      if (lastWasSpace) continue
      lastWasSpace = true
      text += ' '
      offsets.push(index)
      continue
    }
    lastWasSpace = false
    text += char
    offsets.push(index)
  }

  return { text, offsets }
}

/**
 * Quote-anchored wire format: the agent copies text, never counts offsets.
 *
 * Agents are careless about the edges of a copy — trailing newlines, a stray
 * space, a line break where the document has a paragraph break. Trimming and a
 * whitespace-collapsed second pass turn those into a match instead of a refusal,
 * and the text actually matched is returned so the stored hunk can be verified.
 */
export function locateQuote(flat: FlatText, quote: string): LocateResult {
  const needle = quote.trim()
  if (needle === '') return { ok: false, error: 'not-found', matches: [] }

  const matches: number[] = []
  let at = flat.text.indexOf(needle)
  while (at !== -1) {
    matches.push(at)
    at = flat.text.indexOf(needle, at + 1)
  }

  if (matches.length === 0) {
    // Second chance: same words, different whitespace.
    const collapsed = collapse(flat)
    const collapsedNeedle = needle.replace(/\s+/g, ' ')
    const collapsedMatches: number[] = []
    let hit = collapsed.text.indexOf(collapsedNeedle)
    while (hit !== -1) {
      collapsedMatches.push(hit)
      hit = collapsed.text.indexOf(collapsedNeedle, hit + 1)
    }

    if (collapsedMatches.length === 0) return { ok: false, error: 'not-found', matches }
    if (collapsedMatches.length > 1) {
      return { ok: false, error: 'ambiguous', matches: collapsedMatches }
    }

    const startOffset = collapsed.offsets[collapsedMatches[0] as number] as number
    const endOffset = collapsed.offsets[(collapsedMatches[0] as number) + collapsedNeedle.length - 1] as number
    return anchorsFor(flat, startOffset, endOffset + 1)
  }

  if (matches.length > 1) return { ok: false, error: 'ambiguous', matches }

  const start = matches[0] as number
  return anchorsFor(flat, start, start + needle.length)
}

function anchorsFor(flat: FlatText, start: number, endExclusive: number): LocateResult {
  // Never start or end on a synthetic separator: it has no anchor to hold on to.
  while (start < endExclusive && !flat.chars[start]) start += 1
  while (endExclusive > start && !flat.chars[endExclusive - 1]) endExclusive -= 1
  if (start >= endExclusive) return { ok: false, error: 'not-found', matches: [] }

  const matched = flat.text.slice(start, endExclusive)
  const from = encodeAt(flat, start, 0)
  const last = flat.chars[endExclusive - 1]
  if (!from || !last) return { ok: false, error: 'not-found', matches: [] }

  // End-exclusive: the position after the last character, associated backwards.
  const to = Y.encodeRelativePosition(
    Y.createRelativePositionFromTypeIndex(last.node, last.index + 1, -1),
  )

  return { ok: true, from, to, matched }
}

export interface ResolvedAnchor {
  node: Y.XmlText
  index: number
}

export function resolveAnchor(doc: Y.Doc, encoded: Uint8Array): ResolvedAnchor | null {
  const relative = Y.decodeRelativePosition(encoded)
  const absolute = Y.createAbsolutePositionFromRelativePosition(relative, doc)
  if (!absolute || !(absolute.type instanceof Y.XmlText)) return null
  return { node: absolute.type, index: absolute.index }
}

/** The text currently sitting at a pair of anchors, for stale detection. */
export function textBetween(doc: Y.Doc, from: Uint8Array, to: Uint8Array | null): string | null {
  const start = resolveAnchor(doc, from)
  if (!start) return null
  const end = to ? resolveAnchor(doc, to) : start
  if (!end) return null

  const nodes = textNodes(doc.getXmlFragment('content'))
  const startAt = nodes.indexOf(start.node)
  const endAt = nodes.indexOf(end.node)
  if (startAt === -1 || endAt === -1 || endAt < startAt) return null

  return nodes
    .slice(startAt, endAt + 1)
    .map((node, offset) => {
      const value = node.toString()
      const begin = offset === 0 ? start.index : 0
      const finish = startAt + offset === endAt ? end.index : value.length
      return value.slice(begin, finish)
    })
    .join('')
}

export function textNodes(root: Y.XmlFragment | Y.XmlElement, out: Y.XmlText[] = []): Y.XmlText[] {
  for (const child of root.toArray()) {
    if (child instanceof Y.XmlText) out.push(child)
    else if (child instanceof Y.XmlElement) textNodes(child, out)
  }
  return out
}
