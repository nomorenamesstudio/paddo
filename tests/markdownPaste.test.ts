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

  it('recognises a table, which the schema can hold since 0.1.6', () => {
    expect(looksLikeMarkdown('| a | b |\n| --- | --- |\n| 1 | 2 |')).toBe(true)
    // A table inside an article is no reason to withhold the formatting around it.
    expect(looksLikeMarkdown('# Heading\n\n| a | b |\n| --- | --- |\n| 1 | 2 |')).toBe(true)
    // A pipe in prose is not a table: there is no delimiter row.
    expect(looksLikeMarkdown('a | b means or\nand so does this')).toBe(false)
  })

  it('takes inline markup only for a single line', () => {
    // One line, no block markers: the writer pasted a marked-up sentence.
    expect(looksLikeMarkdown('a **bold** word')).toBe(true)
    expect(looksLikeMarkdown('see [the notes](https://example.com)')).toBe(true)
    // Several lines of prose that happen to contain an asterisk stay prose: parsing them
    // as markdown is how a paragraph ends up with its emphasis eaten.
    expect(looksLikeMarkdown('one line with *emphasis*\nand a second line')).toBe(false)
  })

  it('leaves ordinary prose alone', () => {
    expect(looksLikeMarkdown('Just a sentence about writing.')).toBe(false)
    expect(looksLikeMarkdown('5 * 3 = 15')).toBe(false)
    expect(looksLikeMarkdown('')).toBe(false)
    expect(looksLikeMarkdown('   \n  ')).toBe(false)
  })
})
