import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export interface DragPreview {
  /** Position of the block being carried. */
  source: number | null
  /** How far the carried block has moved from its origin, in pixels. */
  dx: number
  dy: number
  /** Where it would land, and how much room it needs there. */
  target: number | null
  side: 'before' | 'after'
  height: number
}

export const EMPTY_PREVIEW: DragPreview = {
  source: null,
  dx: 0,
  dy: 0,
  target: null,
  side: 'before',
  height: 0,
}

export const DragPreviewKey = new PluginKey<DragPreview>('paddoDragPreview')

/**
 * The moving-block preview lives in decorations, not in the DOM.
 *
 * Writing `style` or `class` onto a block element puts it straight into
 * ProseMirror's DOM observer, which redraws the node and takes the styles with it
 * — the drag then looks like it does nothing. A node decoration is owned by
 * ProseMirror, so it survives every redraw.
 */
export const DragPreviewExtension = Extension.create({
  name: 'paddoDragPreview',

  addProseMirrorPlugins() {
    return [
      new Plugin<DragPreview>({
        key: DragPreviewKey,
        state: {
          init: () => EMPTY_PREVIEW,
          apply: (tr, value) => {
            const next = tr.getMeta(DragPreviewKey) as DragPreview | undefined
            return next ?? value
          },
        },
        props: {
          decorations: (state) => {
            const preview = DragPreviewKey.getState(state)
            if (!preview || preview.source == null) return DecorationSet.empty

            const decorations: Decoration[] = []
            const sourceNode = state.doc.nodeAt(preview.source)
            if (sourceNode) {
              decorations.push(
                Decoration.node(preview.source, preview.source + sourceNode.nodeSize, {
                  class: 'is-dragging',
                  style: `transform: translate(${preview.dx}px, ${preview.dy}px)`,
                }),
              )
            }

            if (preview.target != null && preview.target !== preview.source) {
              const targetNode = state.doc.nodeAt(preview.target)
              if (targetNode) {
                const padding =
                  preview.side === 'before'
                    ? `padding-top: ${preview.height}px;`
                    : `padding-bottom: ${preview.height}px;`
                decorations.push(
                  Decoration.node(preview.target, preview.target + targetNode.nodeSize, {
                    style: padding,
                    class: 'is-drop-target',
                  }),
                )
              }
            }

            return DecorationSet.create(state.doc, decorations)
          },
        },
      }),
    ]
  },
})
