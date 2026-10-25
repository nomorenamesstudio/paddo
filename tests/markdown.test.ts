import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { markdown } from '../src/shared/editor'
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

  it('keeps underscore emphasis rather than rewriting it as asterisks', () => {
    const output = normalizeMarkdown(
      markdown.serialize(markdown.parse('An _emphasized phrase_ sits here.\n')),
    )
    expect(output).toBe('An _emphasized phrase_ sits here.\n')
    expect(output).not.toContain('*')
  })
})
