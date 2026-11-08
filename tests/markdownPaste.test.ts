import { describe, expect, it } from 'vitest'

import { looksLikeMarkdown } from '../src/shared/markdown-paste'

describe('looksLikeMarkdown', () => {
  it('recognises the block syntax a writer would expect to become formatting', () => {
    expect(looksLikeMarkdown('# A heading\n\nbody')).toBe(true)
    expect(looksLikeMarkdown('> quoted line')).toBe(true)
    expect(looksLikeMarkdown('- one\n- two')).toBe(true)
    expect(looksLikeMarkdown('1. first\n2. second')).toBe(true)
    expect(looksLikeMarkdown('```\ncode\n```')).toBe(true)
  })

  it('takes inline markup only for a single line', () => {
    // One line, no block markers: the writer pasted a marked-up sentence.
    expect(looksLikeMarkdown('a **bold** word')).toBe(true)
    expect(looksLikeMarkdown('see [the notes](https://example.com)')).toBe(true)
    // Several lines of prose that happen to contain an asterisk stay prose: parsing them
    // as markdown is how a paragraph ends up with its emphasis eaten.
    expect(looksLikeMarkdown('one line with *emphasis*\nand a second line')).toBe(false)
  })

  it('refuses a table, because the schema has no node for one and the parse drops it', () => {
    // Measured before this rule: a pasted table parsed to an empty document and vanished.
    expect(looksLikeMarkdown('| a | b |\n| --- | --- |\n| 1 | 2 |')).toBe(false)
    expect(looksLikeMarkdown('Intro.\n\n| a | b |\n| --- | --- |\n| 1 | 2 |')).toBe(false)
  })

  it('leaves ordinary prose alone', () => {
    expect(looksLikeMarkdown('Just a sentence about writing.')).toBe(false)
    expect(looksLikeMarkdown('5 * 3 = 15')).toBe(false)
    expect(looksLikeMarkdown('')).toBe(false)
    expect(looksLikeMarkdown('   \n  ')).toBe(false)
  })
})
