import { describe, expect, it } from 'vitest'

import { plainTitle, titleOf } from '../src/server/documents'

describe('titleOf', () => {
  it('gives the reader the words, not the markup', () => {
    // A heading written with bold showed up in the library as "**The Ghosted Story**".
    expect(titleOf('# **The Ghosted Story**\n\nBody.\n', 'new-draft-6')).toBe('The Ghosted Story')
    expect(titleOf('# _Draft_ notes\n', 'slug')).toBe('Draft notes')
    expect(titleOf('# See [the notes](https://example.com) now\n', 'slug')).toBe('See the notes now')
    expect(titleOf('Journal\n\nBody.\n', 'slug')).toBe('Journal')
  })

  it('falls back to the slug when there is nothing to read', () => {
    expect(titleOf('', 'new-draft')).toBe('new-draft')
    expect(titleOf('#   \n', 'new-draft')).toBe('new-draft')
  })

  it('leaves an ordinary title alone', () => {
    expect(plainTitle('The quiet interface')).toBe('The quiet interface')
    expect(plainTitle('Two *words* and a `term`')).toBe('Two words and a term')
  })
})
