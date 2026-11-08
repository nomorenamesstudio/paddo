import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { markdown } from '../src/shared/editor'
import { markdownFromYDoc, yDocFromMarkdown } from '../src/server/collab'
import { normalizeMarkdown } from '../src/server/documents'

/**
 * Contract: opening a document and saving it must not rewrite the file.
 * A serializer that flips `_italic_` to `*italic*` or drops the trailing newline
 * would churn every `.md` on disk — and, with the file watcher running, feed its
 * own output back as suggestions.
 */
describe('markdown round-trip', () => {
  const fixture = readFileSync(new URL('./fixtures/content/essay.md', import.meta.url), 'utf8')

  it('returns the same bytes for a document that came from disk', () => {
    const once = normalizeMarkdown(markdown.serialize(markdown.parse(fixture)))
    expect(once).toBe(fixture)
  })

  it('is stable on the second pass', () => {
    const once = normalizeMarkdown(markdown.serialize(markdown.parse(fixture)))
    const twice = normalizeMarkdown(markdown.serialize(markdown.parse(once)))
    expect(twice).toBe(once)
  })

  it('keeps a table exactly as it was written, unpadded', () => {
    // The packaged renderer pads every cell to its column width and leads with a blank
    // line; a save would then reformat a table the writer typed by hand.
    const source = '## Comparison\n\n| plan | price |\n| --- | --- |\n| free | 0 |\n| team | 12 |\n'
    expect(normalizeMarkdown(markdown.serialize(markdown.parse(source)))).toBe(source)
  })

  it('carries a table through the CRDT, which is what a save actually writes', () => {
    // The server serializes from the Y.Doc, not from the parsed markdown: a table has to
    // survive y-prosemirror as well.
    const source = '| plan | price |\n| --- | --- |\n| free | 0 |\n'
    expect(normalizeMarkdown(markdownFromYDoc(yDocFromMarkdown(source)))).toBe(source)
  })

  it('keeps underscore emphasis rather than rewriting it as asterisks', () => {
    const output = normalizeMarkdown(
      markdown.serialize(markdown.parse('An _emphasized phrase_ sits here.\n')),
    )
    expect(output).toBe('An _emphasized phrase_ sits here.\n')
    expect(output).not.toContain('*')
  })
})
