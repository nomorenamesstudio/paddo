import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { Editor } from '@tiptap/react'

import { blockAt, moveBlock, type BlockRef } from '../editor/move'

interface Indicator {
  top: number
  side: 'before' | 'after'
}

const DRAG_THRESHOLD = 8
const CLICK_GRACE = 400

interface Frame {
  top: number
  height: number
}

/**
 * Moving a paragraph works two ways, and both are the same transaction:
 *
 *  - drag the grip and release where it should land (desktop);
 *  - tap the grip once, then tap the destination (touch, and keyboard with Esc).
 *
 * The picked block is visibly lifted, and the destination shows an insertion
 * line, because a mode with no feedback reads as a broken button.
 */
export function BlockMover({ editor, container }: { editor: Editor | null; container: HTMLElement | null }) {
  const [active, setActive] = useState<BlockRef | null>(null)
  const [moving, setMoving] = useState<BlockRef | null>(null)
  const [gripTop, setGripTop] = useState<number | null>(null)
  const [indicator, setIndicator] = useState<Indicator | null>(null)

  const [frame, setFrame] = useState<Frame | null>(null)

  const pressPoint = useRef<{ x: number; y: number } | null>(null)
  const dragged = useRef(false)
  const lastDrop = useRef(0)

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

  const locate = useCallback(
    (clientX: number, clientY: number): { pos: number; block: BlockRef; side: 'before' | 'after' } | null => {
      if (!editor) return null
      const pos = editor.view.posAtCoords({ left: clientX, top: clientY })?.pos
      if (pos == null) return null
      const block = blockAt(editor, pos)
      if (!block) return null
      const coords = editor.view.coordsAtPos(block.pos)
      return { pos, block, side: clientY > coords.top + 24 ? 'after' : 'before' }
    },
    [editor],
  )

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

  // The picked block is lifted visibly. Drawn as an overlay rather than a class on
  // the block itself: ProseMirror redraws block elements at will and takes the class
  // with them.
  useEffect(() => {
    if (!editor || !container || !moving) {
      setFrame(null)
      return
    }
    try {
      const start = editor.view.coordsAtPos(moving.pos)
      const end = editor.view.coordsAtPos(moving.pos + Math.max(1, moving.node.nodeSize - 1))
      const top = start.top - container.getBoundingClientRect().top
      setFrame({ top, height: Math.max(20, end.bottom - start.top) })
    } catch {
      setFrame(null)
    }
  }, [editor, container, moving])

  // Drag to land, or tap to pick and tap again to place.
  useEffect(() => {
    if (!editor || !moving) {
      setIndicator(null)
      dragged.current = false
      return
    }

    const update = (x: number, y: number) => {
      const hit = locate(x, y)
      if (!hit) return null
      setIndicator({ top: measure(hit.block.pos) ?? 0, side: hit.side })
      return hit
    }

    const place = (hit: { pos: number; block: BlockRef; side: 'before' | 'after' }) => {
      if (hit.block.pos === moving.pos) {
        // Dropped on itself: keep it picked rather than moving nothing.
        return
      }
      if (!moveBlock(editor, moving.pos, hit.pos, hit.side)) {
        window.dispatchEvent(
          new CustomEvent('paddo:notice', { detail: 'That block cannot move there.' }),
        )
      }
      lastDrop.current = Date.now()
      setMoving(null)
    }

    const onPointerMove = (event: PointerEvent) => {
      if (pressPoint.current) {
        const dx = event.clientX - pressPoint.current.x
        const dy = event.clientY - pressPoint.current.y
        if (Math.hypot(dx, dy) > DRAG_THRESHOLD) dragged.current = true
      }
      update(event.clientX, event.clientY)
    }

    const onMouseMove = (event: MouseEvent) => {
      update(event.clientX, event.clientY)
    }

    const onPointerUp = (event: PointerEvent) => {
      const startedOnGrip = pressPoint.current !== null
      pressPoint.current = null
      if (!startedOnGrip) return
      if (!dragged.current) return // a click on the grip: stay picked, wait for the destination
      const hit = update(event.clientX, event.clientY)
      if (hit) place(hit)
      else setMoving(null)
    }

    const onClick = (event: MouseEvent) => {
      if ((event.target as HTMLElement | null)?.closest('.grip')) return
      if (Date.now() - lastDrop.current < CLICK_GRACE) return
      event.preventDefault()
      event.stopPropagation()
      const hit = update(event.clientX, event.clientY)
      if (hit) place(hit)
      else setMoving(null)
    }

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMoving(null)
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
  }, [editor, moving, locate, measure])

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
            setMoving(null)
            return
          }
          if (active) setMoving(active)
        }}
      >
        ⠿
      </button>
    )
  }, [active, gripTop, moving])

  return (
    <>
      {grip}
      {moving ? (
        <>
          {frame ? (
            <div
              className="move-frame"
              style={{ top: `${frame.top}px`, height: `${frame.height}px` }}
              aria-hidden="true"
            />
          ) : null}
          {indicator ? (
            <div
              className={`move-line move-line--${indicator.side}`}
              style={{ top: `${indicator.top}px` }}
              aria-hidden="true"
            />
          ) : null}
          <div className="move-hint" role="status">
            Drop it, or tap where it goes — Esc to cancel
          </div>
        </>
      ) : null}
    </>
  )
}
