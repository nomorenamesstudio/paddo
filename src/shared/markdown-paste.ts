/**
 * Does this clipboard text look like markdown source rather than prose?
 *
 * Pasting an article from a notes app or an agent's answer used to land as literal
 * asterisks and hashes. Tiptap can parse markdown into the document, but it needs to be
 * told when to — and parsing *every* paste would mangle a paragraph that happens to
 * contain an asterisk. So the question is narrow: does this text carry markdown syntax a
 * writer would expect to become formatting?
 *
 * Deliberately not clever. One recognised marker is enough when it is a block marker
 * (`#`, `>`, a list, a fence); inline markers (`**`, `_`, a link) count only when the
 * paste is a single line, because in a longer paste they are usually quoted code.
 */
const BLOCK_MARKERS = [
  /^#{1,6}\s+\S/m, // a heading
  /^>\s+\S/m, // a blockquote
  /^[-*+]\s+\S/m, // a bullet
  /^\d+[.)]\s+\S/m, // an ordered list
  /^```/m, // a fence
]

/** A GFM table: a header row and the delimiter row under it. */
const TABLE = /^\s*\|.*\|\s*\n\s*\|?[\s:|-]*-[\s:|-]*\|[\s:|-]*$/m

const INLINE_MARKERS = [
  /\*\*[^*\n]+\*\*/, // bold
  /\[[^\]\n]+\]\([^)\n]+\)/, // a link
  /`[^`\n]+`/, // inline code
]

export function looksLikeMarkdown(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false

  // A fence or a table is unambiguous, however short the paste.
  if (/^```/.test(trimmed)) return true
  if (TABLE.test(trimmed)) return true
  if (BLOCK_MARKERS.some((pattern) => pattern.test(trimmed))) return true

  // Inline-only markup: a single line, so "the *one* caveat" stays a sentence.
  if (trimmed.includes('\n')) return false
  return INLINE_MARKERS.some((pattern) => pattern.test(trimmed))
}

/**
 * Splits a leading YAML front-matter block from the prose under it.
 *
 * Paddō's documents have no metadata block — the heading is the title — so the parser
 * treats `title: …` under a `---` rule as a setext heading and the first `---` as a
 * horizontal rule: a pasted case study arrived with its front matter restructured into an
 * `<hr>` and an H2. The block is pulled out here so its lines can be kept as text instead.
 */
export function splitFrontmatter(text: string): { frontmatter: string[] | null; body: string } {
  const match = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text)
  if (!match) return { frontmatter: null, body: text }

  const lines = (match[1] ?? '')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== '')

  return { frontmatter: lines.length > 0 ? lines : null, body: text.slice(match[0].length) }
}
