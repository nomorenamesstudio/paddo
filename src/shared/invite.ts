/**
 * The text a writer pastes into their own agent session. Last by design: the guide
 * is what makes the agent sound like the writer, so it is not an afterthought.
 */
export function buildInvitePrompt(
  slug: string,
  title: string,
  origin: string,
  guide = '',
): string {
  const writingGuide = guide.trim()
  return [
    `Work on the Paddō document "${title}" (slug: "${slug}").`,
    ...(writingGuide ? ['', 'Writing guide (from Paddō settings) — follow it:', '', writingGuide] : []),
    '',
    'Tools: Paddō\'s MCP server, started from the paddo repo:',
    `  PADDO_URL=${origin} PADDO_TOKEN=<value from paddo/.env> pnpm mcp`,
    '',
    'Steps:',
    `1. read_document({ document: "${slug}" })`,
    `2. propose_edits({ document: "${slug}", edits: [{ original, proposed, rationale }] })`,
    '',
    'Rules:',
    '- `original` must be copied verbatim from the document. Do not send offsets.',
    '- Keep each hunk small; one sentence or phrase per hunk.',
    '- Put the reason in `rationale` — it is shown to the reader.',
    '- Do not rewrite the whole document in one hunk.',
    '- Never touch the .md file directly; propose instead.',
  ].join('\n')
}
