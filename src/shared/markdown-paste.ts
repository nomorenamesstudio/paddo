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

const INLINE_MARKERS = [
  /\*\*[^*\n]+\*\*/, // bold
  /\[[^\]\n]+\]\([^)\n]+\)/, // a link
  /`[^`\n]+`/, // inline code
]

/**
 * A pipe table has no node in this schema, and parsing one returns *nothing* — the paste
 * would vanish without a word (measured: `| a | b |` over a separator row parses to an
 * empty document). So a paste carrying a table is not markdown as far as this editor is
 * concerned: it arrives as text, which is lossy to look at and lossless to read.
 */
const TABLE = /^\s*\|.*\|\s*$/m

export function looksLikeMarkdown(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  if (TABLE.test(trimmed)) return false

  // A fence is unambiguous, however short the paste.
  if (/^```/.test(trimmed)) return true
  if (BLOCK_MARKERS.some((pattern) => pattern.test(trimmed))) return true

  // Inline-only markup: a single line, so "the *one* caveat" stays a sentence.
  if (trimmed.includes('\n')) return false
  return INLINE_MARKERS.some((pattern) => pattern.test(trimmed))
}
