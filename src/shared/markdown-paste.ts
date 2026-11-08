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

export function looksLikeMarkdown(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false

  // A fence is unambiguous, however short the paste.
  if (/^```/.test(trimmed)) return true
  if (BLOCK_MARKERS.some((pattern) => pattern.test(trimmed))) return true

  // Inline-only markup: a single line, so "the *one* caveat" stays a sentence.
  if (trimmed.includes('\n')) return false
  return INLINE_MARKERS.some((pattern) => pattern.test(trimmed))
}

const PIPE_LINE = /^\s*\|.*\|\s*$/
/** Only pipes, dashes, colons and spaces: the row that makes a table a table. */
const DELIMITER_ROW = /^\s*\|?[\s:|-]*-[\s:|-]*\|[\s:|-]*$/

export interface PasteSegment {
  /** `table` is prose in the file but has no node here, so it goes in as text. */
  kind: 'markdown' | 'table'
  text: string
}

/**
 * Splits a paste into the parts this schema can hold and the parts it cannot.
 *
 * A pipe table has no node, and the markdown parser drops a table *without a word*
 * (measured: `| a | b |` over a separator row parses to an empty document). Refusing the
 * whole paste instead is how a single table in a long article cost every heading its
 * formatting, so the two are separated here: the prose is parsed, the table goes in as
 * text — lossy to look at, lossless to read.
 */
export function splitTables(text: string): PasteSegment[] {
  const lines = text.split('\n')
  const segments: PasteSegment[] = []
  let prose: string[] = []

  const flushProse = () => {
    if (prose.length > 0) segments.push({ kind: 'markdown', text: prose.join('\n') })
    prose = []
  }

  let index = 0
  while (index < lines.length) {
    const line = lines[index] ?? ''
    if (!PIPE_LINE.test(line)) {
      prose.push(line)
      index += 1
      continue
    }

    // A run of pipe lines is a table when one of them is the delimiter row; otherwise it
    // is prose that happens to contain a pipe.
    const run: string[] = []
    while (index < lines.length && PIPE_LINE.test(lines[index] ?? '')) {
      run.push(lines[index] ?? '')
      index += 1
    }
    if (run.some((entry) => DELIMITER_ROW.test(entry))) {
      flushProse()
      segments.push({ kind: 'table', text: run.join('\n') })
    } else {
      prose.push(...run)
    }
  }

  flushProse()
  return segments.filter((segment) => segment.text.trim() !== '')
}
