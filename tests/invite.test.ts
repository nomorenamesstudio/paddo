import { describe, expect, it } from 'vitest'

import { buildInvitePrompt } from '../src/shared/invite'

describe('buildInvitePrompt', () => {
  it('leads with the title the writer sees and the slug the tools take', () => {
    const prompt = buildInvitePrompt('new-draft-6', 'New draft about tides', 'http://127.0.0.1:4319')
    expect(prompt.split('\n')[0]).toBe(
      'Work on the Paddō document "New draft about tides" (slug: "new-draft-6").',
    )
    expect(prompt).toContain('read_document({ document: "new-draft-6" })')
  })

  it('carries the writing guide when there is one, and says nothing when there is not', () => {
    // The guide is the only thing that makes the agent sound like the writer, so a
    // silently dropped guide is a real regression, not a cosmetic one.
    const withGuide = buildInvitePrompt('slug', 'Title', 'http://host', '  Never use "leverage".  ')
    expect(withGuide).toContain('Writing guide (from Paddō settings) — follow it:')
    expect(withGuide).toContain('Never use "leverage".')

    const withoutGuide = buildInvitePrompt('slug', 'Title', 'http://host', '   ')
    expect(withoutGuide).not.toContain('Writing guide')
  })
})
