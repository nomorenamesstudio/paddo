import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { Editor } from '@tiptap/react'

import { DragPreviewKey, EMPTY_PREVIEW, type DragPreview } from '../editor/drag-preview'
import { blockAt, moveBlock, type BlockRef } from '../editor/move'

const DRAG_THRESHOLD = 8
const CLICK_GRACE = 400

interface Drag {
  pos: number
  height: number
  startX: number
  startY: number
}

/**
 * Moving a paragraph works two ways, both committed as the same transaction:
 *
 *  - drag the grip and release where it should land;
 *  - tap the grip once, then tap the destination (touch, and keyboard with Esc).
 *
 * While either is in progress the preview is a pair of decorations: the carried
 * block is translated with the pointer and the destination opens a gap its own
 * height, so the surrounding text moves as you drag.
 */
export function BlockMover({ editor, container }: { editor: Editor | null; container: HTMLElement | null }) {
  const [active, setActive] = useState<BlockRef | null>(null)
  const [moving, setMoving] = useState<BlockRef | null>(null)
  const [gripTop, setGripTop] = useState<number | null>(null)

  const pressPoint = useRef<{ x: number; y: number } | null>(null)
  const drag = useRef<Drag | null>(null)
  const dragged = useRef(false)
  const lastDrop = useRef(0)
  /** The last place the pointer actually pointed at, kept while it is off the column. */
  const lastTarget = useRef<{ pos: number; block: BlockRef; side: 'before' | 'after' } | null>(null)

  const measure = useCallback(
    (blockPos: number): number | null => {
      if (!editor || !container) return null
      try {
        const coords = editor.view.coordsAtPos(blockPos)
        return coords.top - container.getBoundingClientRect().top
      } catch {
        return null
      }
    },
    [editor, container],
  )

  /**
   * Where a pointer currently means to drop. Coordinates outside the text column
   * are clamped into it — dragging into the margin is not a cancel — and if even
   * that yields nothing, the last real target stays sticky, so releasing outside
   * the column still lands the block where it was last pointed.
   */
  const locate = useCallback(
    (clientX: number, clientY: number): { pos: number; block: BlockRef; side: 'before' | 'after' } | null => {
      if (!editor) return lastTarget.current

      const rect = editor.view.dom.getBoundingClientRect()
      const x = Math.min(Math.max(clientX, rect.left + 1), rect.right - 1)
      const y = Math.min(Math.max(clientY, rect.top + 1), rect.bottom - 1)

      const pos = editor.view.posAtCoords({ left: x, top: y })?.pos
      if (pos == null) return lastTarget.current

      const block = blockAt(editor, pos)
      if (!block) return lastTarget.current

      const coords = editor.view.coordsAtPos(block.pos)
      const hit = { pos, block, side: (y > coords.top + 24 ? 'after' : 'before') as 'before' | 'after' }
      lastTarget.current = hit
      return hit
    },
    [editor],
  )

  const preview = useCallback(
    (next: DragPreview) => {
      if (!editor || editor.isDestroyed) return
      // Decorations only: no document change, so no CRDT traffic and no undo entry.
      editor.view.dispatch(editor.state.tr.setMeta(DragPreviewKey, next))
    },
    [editor],
  )

  const clearPreview = useCallback(() => preview(EMPTY_PREVIEW), [preview])

  // Move mode owns the pointer for its duration: no text selection may start or
  // stay visible, because the only thing to read on screen is where it lands.
  useEffect(() => {
    if (!moving) return
    document.body.classList.add('is-moving-mode')
    window.getSelection()?.removeAllRanges()
    return () => document.body.classList.remove('is-moving-mode')
  }, [moving])

  useEffect(() => {
    return () => {
      if (editor && !editor.isDestroyed) clearPreview()
    }
  }, [editor, clearPreview])

  // Hovering the prose parks the grip beside the block under the pointer.
  useEffect(() => {
    if (!editor || !container || moving) return
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return
      const pos = editor.view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos
      if (pos == null) return
      const block = blockAt(editor, pos)
      if (!block) return
      setActive(block)
      setGripTop(measure(block.pos))
    }
    container.addEventListener('pointermove', onPointerMove)
    return () => container.removeEventListener('pointermove', onPointerMove)
  }, [editor, container, moving, measure])

  // On touch there is no hover: the grip follows the caret instead.
  useEffect(() => {
    if (!editor || moving) return
    const onSelection = () => {
      const block = blockAt(editor, editor.state.selection.head)
      if (!block) return
      setActive(block)
      setGripTop(measure(block.pos))
    }
    editor.on('selectionUpdate', onSelection)
    return () => {
      editor.off('selectionUpdate', onSelection)
    }
  }, [editor, moving, measure])

  // Track the pointer, keep the preview current, and commit on release or tap.
  useEffect(() => {
    if (!editor || !moving) {
      dragged.current = false
      return
    }

    lastTarget.current = null

    const update = (clientX: number, clientY: number) => {
      const hit = locate(clientX, clientY)
      const base = drag.current
      const carried = dragged.current && base

      preview({
        source: moving.pos,
        dx: carried ? clientX - base.startX : 0,
        dy: carried ? clientY - base.startY : 0,
        target: hit && hit.block.pos !== moving.pos ? hit.block.pos : null,
        side: hit?.side ?? 'before',
        height: base?.height ?? 0,
      })

      return hit
    }

    const track = (clientX: number, clientY: number) => {
      const origin = pressPoint.current
      if (origin && drag.current && !dragged.current) {
        if (Math.hypot(clientX - origin.x, clientY - origin.y) > DRAG_THRESHOLD) dragged.current = true
      }
      update(clientX, clientY)
    }

    const place = (hit: { pos: number; block: BlockRef; side: 'before' | 'after' } | null) => {
      clearPreview()
      const target = hit ?? lastTarget.current
      if (!target || target.block.pos === moving.pos) {
        setMoving(null)
        return
      }
      hit = target
      if (!moveBlock(editor, moving.pos, hit.pos, hit.side)) {
        window.dispatchEvent(
          new CustomEvent('paddo:notice', { detail: 'That block cannot move there.' }),
        )
      }
      lastDrop.current = Date.now()
      setMoving(null)
    }

    const onPointerMove = (event: PointerEvent) => track(event.clientX, event.clientY)
    const onMouseMove = (event: MouseEvent) => track(event.clientX, event.clientY)

    const onPointerUp = (event: PointerEvent) => {
      const startedOnGrip = pressPoint.current !== null
      const wasDragging = dragged.current
      pressPoint.current = null
      dragged.current = false
      if (!startedOnGrip || !wasDragging) return // a click on the grip: stay picked
      // Released back on the grip: that reads as a cancel, not a drop.
      if ((event.target as HTMLElement | null)?.closest('.grip')) {
        clearPreview()
        setMoving(null)
        return
      }
      place(locate(event.clientX, event.clientY))
    }

    const onClick = (event: MouseEvent) => {
      if ((event.target as HTMLElement | null)?.closest('.grip')) return
      if (Date.now() - lastDrop.current < CLICK_GRACE) return

      // A tap only places on the text. Anywhere else — a button, the margin, the
      // bars — cancels the move and lets the click do what it normally does.
      if (!editor.view.dom.contains(event.target as Node)) {
        clearPreview()
        setMoving(null)
        return
      }

      event.preventDefault()
      event.stopPropagation()
      place(locate(event.clientX, event.clientY))
    }

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        clearPreview()
        setMoving(null)
      }
    }

    document.addEventListener('pointermove', onPointerMove, true)
    document.addEventListener('mousemove', onMouseMove, true)
    document.addEventListener('pointerup', onPointerUp, true)
    document.addEventListener('click', onClick, true)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointermove', onPointerMove, true)
      document.removeEventListener('mousemove', onMouseMove, true)
      document.removeEventListener('pointerup', onPointerUp, true)
      document.removeEventListener('click', onClick, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [editor, moving, locate, preview, clearPreview])

  const grip = useMemo(() => {
    if (!active || gripTop == null) return null
    return (
      <button
        type="button"
        className={`grip${moving ? ' grip--active' : ''}`}
        style={{ top: `${gripTop}px` }}
        aria-label={moving ? 'Cancel move' : 'Move this paragraph'}
        title={moving ? 'Cancel move (Esc)' : 'Drag, or tap then tap the destination'}
        onPointerDown={(event) => {
          event.preventDefault()
          pressPoint.current = { x: event.clientX, y: event.clientY }
          dragged.current = false
          if (moving) {
            clearPreview()
            setMoving(null)
            return
          }
          if (!active || !editor) return
          const element = editor.view.nodeDOM(active.pos)
          const box =
            element instanceof HTMLElement
              ? element.getBoundingClientRect()
              : (element?.parentElement?.getBoundingClientRect() ?? null)
          drag.current = {
            pos: active.pos,
            height: box?.height ?? 0,
            startX: event.clientX,
            startY: event.clientY,
          }
          setMoving(active)
        }}
      >
        ⠿
      </button>
    )
  }, [active, gripTop, moving, editor, clearPreview])

  return (
    <>
      {grip}
      {moving ? (
        <div className="move-hint" role="status">
          Drop it, or tap where it goes — Esc to cancel
        </div>
      ) : null}
    </>
  )
}
