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

/** The text inside an HTML fragment, so a clipboard can be judged by what it carries. */
export function htmlText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr|blockquote|pre)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
}

const collapse = (value: string) => value.replace(/\s+/g, ' ').trim()

/**
 * Does the HTML flavour of a clipboard say more than its plain text?
 *
 * A code editor or an IDE copies markdown as `<div style="…">## Heading…</div>`: the HTML is
 * a wrapper around the same characters. A browser copying rendered prose carries structure
 * the plain text does not. The difference decides who parses the paste — ProseMirror for
 * rich content, the markdown parser for the text-only source. Measured 2026-11-04: bailing
 * out on any HTML at all meant a case study copied from an editor landed as literal `##`.
 */
/** Tags that carry meaning a plain-text clipboard would lose. */
const STRUCTURAL_TAG =
  /<(h[1-6]|strong|b|em|i|u|s|del|code|pre|blockquote|ul|ol|li|table|thead|tbody|tr|td|th|img|a|figure|figcaption|hr)\b/i

export function isRichClipboard(html: string | undefined, text: string): boolean {
  if (!html) return false
  // An editor's wrapper is divs, spans and breaks; anything with real tags is content the
  // plain-text flavour cannot represent, and ProseMirror should have it.
  if (STRUCTURAL_TAG.test(html)) return true
  return collapse(htmlText(html)) !== collapse(text)
}
