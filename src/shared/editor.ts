import { getSchema } from '@tiptap/core'
import { Italic } from '@tiptap/extension-italic'
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table'
import { MarkdownManager } from '@tiptap/markdown'
import { StarterKit } from '@tiptap/starter-kit'

/**
 * The schema and the markdown serializer are shared by the browser and the
 * server: the client parses nothing from markdown, but both sides must agree on
 * node names and on the Yjs fragment field, and the server serializes on save.
 */

export const CONTENT_FIELD = 'content'

/**
 * The reference prose uses `_italics_`. Tiptap's default renderer emits `*`,
 * which would rewrite every emphasized phrase in the file on first save.
 */
export const UnderscoreItalic = Italic.extend({
  renderMarkdown: (node, helpers) => `_${helpers.renderChildren(node)}_`,
})

/**
 * GFM tables, written the way a hand-written file writes them: no column padding, no
 * extra blank line, so saving never reformats the table the writer typed. The packaged
 * renderer pads every cell to its column width and leads with a newline, which is fine
 * on a screen and wrong in a `.md` file that a human reads and greps.
 *
 * Same reasoning as `UnderscoreItalic`: the file's shape is the writer's, not the
 * serializer's.
 */
const PlainTable = Table.extend({
  renderMarkdown: (node, helpers) => {
    const rows = (node.content ?? []).filter((child) => child.type === 'tableRow')
    if (rows.length === 0) return ''

    const cellText = (cell: (typeof rows)[number]) =>
      (cell.content ?? [])
        .map((child) => helpers.renderChildren(child))
        .join(' ')
        .replace(/\s*\r?\n\s*/g, ' ')
        .replace(/\|/g, '\\|')
        .trim()

    const grid = rows.map((row) => (row.content ?? []).map(cellText))
    const columns = grid.reduce((widest, row) => Math.max(widest, row.length), 0)
    if (columns === 0) return ''

    const isHeader = (rows[0]?.content ?? []).some((cell) => cell.type === 'tableHeader')
    const alignments = Array.from({ length: columns }, (_, index) => {
      for (const row of rows) {
        const align = row.content?.[index]?.attrs?.align
        if (typeof align === 'string') return align
      }
      return null
    })
    const separator = alignments.map((align) =>
      align === 'center' ? ':---:' : align === 'right' ? '---:' : align === 'left' ? ':---' : '---',
    )

    const line = (cells: string[]) =>
      `| ${Array.from({ length: columns }, (_, index) => cells[index] ?? '').join(' | ')} |`

    const body = grid.map(line)
    if (isHeader) return [body[0], line(separator), ...body.slice(1)].join('\n')
    return [line(Array.from({ length: columns }, () => '')), line(separator), ...body].join('\n')
  },
})

export function baseExtensions(options: { collaborative?: boolean } = {}) {
  return [
    StarterKit.configure({
      italic: false,
      // Collaboration brings its own undo manager; two histories fight.
      undoRedo: options.collaborative ? false : {},
      link: {
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { rel: 'noopener noreferrer' },
      },
    }),
    UnderscoreItalic,
    // Tables are prose too: a pasted comparison table used to vanish because the schema
    // had no node for one. The kit carries the markdown hooks, so a table parses from and
    // serializes back to GFM — the file keeps the table it had.
    PlainTable.configure({ resizable: false }),
    TableRow,
    TableHeader,
    TableCell,
  ]
}

export const schema = getSchema(baseExtensions())

export const markdown = new MarkdownManager({ extensions: baseExtensions() })
