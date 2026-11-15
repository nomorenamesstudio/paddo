import { describe, expect, it } from 'vitest'

import { restoreRawHtml } from '../src/server/fidelity'

describe('raw HTML survives the editor round-trip', () => {
  it('restores an escaped HTML comment, which is what an imported pipeline block looked like', () => {
    const escaped = '&lt;!-- page: keret.html\ntitle: Keret --&gt;\n\nBody text.\n'
    expect(restoreRawHtml(escaped)).toBe('<!-- page: keret.html\ntitle: Keret -->\n\nBody text.\n')
  })

  it('restores other escaped tags in the prose', () => {
    expect(restoreRawHtml('A &lt;figure&gt; block.')).toBe('A <figure> block.')
  })

  it('leaves fenced code exactly as the author wrote it', () => {
    const source = 'Escaped outside: &lt;div&gt;\n\n```html\n&lt;div class="x"&gt;\n```\n'
    expect(restoreRawHtml(source)).toBe(
      'Escaped outside: <div>\n\n```html\n&lt;div class="x"&gt;\n```\n',
    )
  })

  it('undoes the escaping of an ampersand, which is one level of one escape', () => {
    // The serializer always escapes `&` in prose, so a single `&amp;` in the output can
    // only stand for a literal ampersand in the text: "Lead Product Designer &amp; Design
    // Engineer" in an exported CV was the reported bug.
    expect(restoreRawHtml('Fish &amp; chips.')).toBe('Fish & chips.')
    // Undone once, not twice: a writer who typed `&lt;` gets `&lt;` back.
    expect(restoreRawHtml('&amp;lt;div&amp;gt;')).toBe('&lt;div&gt;')
  })

  it('restores a bare less-than and greater-than in prose', () => {
    expect(restoreRawHtml('a &lt; b and c &gt; d')).toBe('a < b and c > d')
  })
})
