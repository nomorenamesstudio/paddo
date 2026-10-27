import { describe, expect, it } from 'vitest'

import { diffToHunks } from '../src/server/diff'

/**
 * Contract: a rewritten document becomes a handful of reviewable hunks. Each
 * hunk must reproduce exactly the text it replaces and the text it inserts — a
 * hunk that swallows untouched prose would show the reader a huge diff for a
 * one-word edit, and applying it would duplicate the swallowed text.
 */
describe('diff to hunks', () => {
  it('turns a one-word change into a single hunk', () => {
    const hunks = diffToHunks('It is power made quiet today.', 'It is power made louder today.')
    expect(hunks).toHaveLength(1)
    expect(hunks[0]?.original).toBe('quiet')
    expect(hunks[0]?.proposed).toBe('louder')
  })

  it('does not drag the rest of the paragraph into the hunk', () => {
    const before = 'Headers are doors. Blockquotes are the argument stepping aside. The rest is restraint.'
    const after = 'Headers are doors, and a blockquote is a room. Blockquotes are the argument stepping aside. The rest is restraint.'
    const hunks = diffToHunks(before, after)

    expect(hunks).toHaveLength(1)
    expect(hunks[0]?.original.length).toBeLessThan(20)
    expect(hunks[0]?.proposed).not.toContain('The rest is restraint')
  })

  it('reports an append at the end as an empty-original hunk at the text end', () => {
    const before = 'One paragraph.'
    const after = 'One paragraph.\n\nA new closing paragraph.'
    const hunks = diffToHunks(before, after)

    expect(hunks).toHaveLength(1)
    expect(hunks[0]?.original).toBe('')
    expect(hunks[0]?.start).toBe(before.length)
    expect(hunks[0]?.end).toBe(before.length)
  })

  it('returns nothing when the text is unchanged', () => {
    expect(diffToHunks('Same text here.', 'Same text here.')).toEqual([])
  })

  it('ignores a change that is only whitespace', () => {
    // Measured: a rename made the watcher diff a file without the trailing blank
    // paragraph the editor keeps, and the reader got a hunk that deleted "\n\n".
    expect(diffToHunks('Case closed.\n\n', 'Case closed.\n')).toEqual([])
    expect(diffToHunks('a\n\nb', 'a b')).toEqual([])
    expect(diffToHunks('Case closed.', 'Case closed. Indeed.')).toHaveLength(1)
  })
})
