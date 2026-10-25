import { getSchema } from '@tiptap/core'
import { Italic } from '@tiptap/extension-italic'
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
  ]
}

export const schema = getSchema(baseExtensions())

export const markdown = new MarkdownManager({ extensions: baseExtensions() })
