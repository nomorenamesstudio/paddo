import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'

import { anchorRange, flatten, locateQuote, resolveAnchor, textBetween } from '../src/server/anchors'
import { yDocFromMarkdown } from '../src/server/collab'

const SOURCE = '# Heading\n\nFirst paragraph with a quote in it.\n\nSecond paragraph ends here.\n'

function doc() {
  return yDocFromMarkdown(SOURCE)
}

/**
 * Contract: the agent quotes text; the server turns that quote into a Yjs
 * relative position that still points at the same words after the document moves
 * underneath it. Ambiguity is refused rather than guessed, because a wrong guess
 * edits the wrong sentence.
 */
describe('quote anchoring', () => {
  it('resolves a unique quote to its characters', () => {
    const ydoc = doc()
    const flat = flatten(ydoc.getXmlFragment('content'))
    const located = locateQuote(flat, 'a quote in it')

    expect(located.ok).toBe(true)
    if (!located.ok) return
    expect(textBetween(ydoc, located.from, located.to)).toBe('a quote in it')
  })

  it('refuses a quote that appears more than once', () => {
    const ydoc = yDocFromMarkdown('Same words here.\n\nSame words here.\n')
    const flat = flatten(ydoc.getXmlFragment('content'))
    const located = locateQuote(flat, 'Same words')

    expect(located.ok).toBe(false)
    if (located.ok) return
    expect(located.error).toBe('ambiguous')
    expect(located.matches).toHaveLength(2)
  })

  it('keeps pointing at the quoted text after an edit before it', () => {
    const ydoc = doc()
    const flat = flatten(ydoc.getXmlFragment('content'))
    const located = locateQuote(flat, 'ends here')
    expect(located.ok).toBe(true)
    if (!located.ok) return

    // Someone types at the very start of the document.
    const first = flat.chars.find((entry) => entry !== null)
    expect(first).toBeTruthy()
    if (!first) return
    first.node.insert(0, 'New opening sentence. ')

    expect(textBetween(ydoc, located.from, located.to)).toBe('ends here')
  })

  it('survives an encode/decode round trip, as a restart would', () => {
    const ydoc = doc()
    const flat = flatten(ydoc.getXmlFragment('content'))
    const located = locateQuote(flat, 'Second paragraph')
    expect(located.ok).toBe(true)
    if (!located.ok) return

    const restored = new Y.Doc()
    Y.applyUpdate(restored, Y.encodeStateAsUpdate(ydoc))
    const anchor = resolveAnchor(restored, located.from)
    expect(anchor?.node.toString().slice(anchor.index, anchor.index + 'Second paragraph'.length)).toBe(
      'Second paragraph',
    )
  })

  it('anchors a range that begins at the end of the document', () => {
    // Regression: appending a paragraph produced a hunk at text.length, which
    // used to anchor to nothing and silently drop the suggestion.
    const ydoc = yDocFromMarkdown('One paragraph.\n')
    const { from, to } = (() => {
      const flat = flatten(ydoc.getXmlFragment('content'))
      const anchored = anchorRange(flat, flat.text.length, flat.text.length)
      expect(anchored).toBeTruthy()
      return anchored ?? { from: new Uint8Array(), to: new Uint8Array() }
    })()

    expect(resolveAnchor(ydoc, from)).not.toBeNull()
    expect(resolveAnchor(ydoc, to)).not.toBeNull()
  })
})

describe('seeding a room from markdown', () => {
  /**
   * Contract: loading a document into a room happens at most once. A second seed
   * would append a whole extra copy of the document, because each seed carries a
   * fresh Yjs client id instead of merging into the first.
   */
  it('adds nothing when the room already has content', async () => {
    const { seedDocumentFromMarkdown } = await import('../src/server/collab')
    const ydoc = new Y.Doc()

    expect(seedDocumentFromMarkdown(ydoc, '# One\n\nA paragraph.\n')).toBe(true)
    const afterFirst = ydoc.getXmlFragment('content').length

    expect(seedDocumentFromMarkdown(ydoc, '# One\n\nA paragraph.\n')).toBe(false)
    expect(ydoc.getXmlFragment('content').length).toBe(afterFirst)
    // The paragraph appears once, not twice: the observable half of "no duplicate".
    expect(ydoc.getXmlFragment('content').toString().split('A paragraph.').length - 1).toBe(1)
  })

  it('seeds a room that only holds the placeholder paragraph a live editor keeps', async () => {
    const { seedDocumentFromMarkdown } = await import('../src/server/collab')
    const ydoc = new Y.Doc()
    const fragment = ydoc.getXmlFragment('content')
    // An empty ProseMirror document is invalid, so a connected editor leaves this.
    const placeholder = new Y.XmlElement('paragraph')
    placeholder.insert(0, [new Y.XmlText('')])
    fragment.insert(0, [placeholder])

    expect(seedDocumentFromMarkdown(ydoc, '# Real\n\nContent arrives.\n')).toBe(true)
    expect(fragment.toString()).toContain('Content arrives.')
    expect(fragment.toArray().filter((node) => node.toString().includes('<paragraph></paragraph>'))).toHaveLength(0)
  })
})
