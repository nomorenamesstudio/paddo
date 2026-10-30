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

  it('leaves a bare less-than in prose alone, so an entity reference stays one', () => {
    expect(restoreRawHtml('a &lt; b and c &gt; d')).toBe('a &lt; b and c &gt; d')
  })

  it('does not touch a double-escaped entity or a literal ampersand', () => {
    expect(restoreRawHtml('Fish &amp; chips.')).toBe('Fish &amp; chips.')
    expect(restoreRawHtml('&amp;lt;div&amp;gt;')).toBe('&amp;lt;div&amp;gt;')
  })
})
