import type { Editor } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'

export interface BlockRef {
  pos: number
  node: PMNode
}

/** The top-level block that contains (or starts at) a document position. */
export function blockAt(editor: Editor, pos: number): BlockRef | null {
  const { doc } = editor.state
  const clamped = Math.max(0, Math.min(pos, doc.content.size))
  const $pos = doc.resolve(clamped)

  if ($pos.depth > 0) {
    const blockPos = $pos.before(1)
    const node = doc.nodeAt(blockPos)
    return node ? { pos: blockPos, node } : null
  }

  // A position between two blocks (a click at a block edge): snap to the block
  // that starts there, or the last one in the document.
  const index = Math.min($pos.index(0), doc.childCount - 1)
  if (index < 0) return null
  let blockPos = 0
  for (let i = 0; i < index; i += 1) blockPos += doc.child(i).nodeSize
  const node = doc.child(index)
  return node ? { pos: blockPos, node } : null
}

/**
 * Moves a whole block in one transaction: delete, then insert at the mapped
 * target. One transaction means one undo step, and Yjs sees a single change.
 */
export function moveBlock(
  editor: Editor,
  fromPos: number,
  targetPos: number,
  side: 'before' | 'after',
): boolean {
  const source = blockAt(editor, fromPos)
  const target = blockAt(editor, targetPos)
  if (!source || !target) return false
  if (source.pos === target.pos) return false

  const insertAt = side === 'after' ? target.pos + target.node.nodeSize : target.pos
  const { tr } = editor.state
  tr.delete(source.pos, source.pos + source.node.nodeSize)
  const mapped = tr.mapping.map(insertAt)
  if (mapped < 0 || mapped > tr.doc.content.size) return false
  tr.insert(mapped, source.node)

  editor.view.dispatch(tr.scrollIntoView())
  return true
}
