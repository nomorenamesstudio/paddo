import { describe, expect, it } from 'vitest'

import { looksLikeMarkdown, splitTables } from '../src/shared/markdown-paste'

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

  it('is not fooled by a table into refusing the prose around it', () => {
    // One table in a long article used to cost every heading its formatting, because the
    // whole paste was refused as soon as a pipe line appeared.
    expect(looksLikeMarkdown('| a | b |\n| --- | --- |\n| 1 | 2 |')).toBe(false)
    expect(looksLikeMarkdown('# Heading\n\n| a | b |\n| --- | --- |\n| 1 | 2 |')).toBe(true)
  })

  it('leaves ordinary prose alone', () => {
    expect(looksLikeMarkdown('Just a sentence about writing.')).toBe(false)
    expect(looksLikeMarkdown('5 * 3 = 15')).toBe(false)
    expect(looksLikeMarkdown('')).toBe(false)
    expect(looksLikeMarkdown('   \n  ')).toBe(false)
  })
})

describe('splitTables', () => {
  it('separates a table from the prose around it', () => {
    const segments = splitTables('## Heading\n\ntext\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\nafter')
    expect(segments.map((segment) => segment.kind)).toEqual(['markdown', 'table', 'markdown'])
    expect(segments[0]?.text).toContain('## Heading')
    expect(segments[1]?.text).toContain('| 1 | 2 |')
    expect(segments[2]?.text).toContain('after')
  })

  it('keeps prose that happens to use a pipe', () => {
    const segments = splitTables('a | b means or\nstill prose')
    expect(segments).toEqual([{ kind: 'markdown', text: 'a | b means or\nstill prose' }])
  })

  it('returns a lone table as one table segment', () => {
    expect(splitTables('| a | b |\n| --- | --- |\n| 1 | 2 |')).toEqual([
      { kind: 'table', text: '| a | b |\n| --- | --- |\n| 1 | 2 |' },
    ])
  })
})
