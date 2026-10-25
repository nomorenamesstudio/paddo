import { useCallback, useEffect, useMemo, useState } from 'react'

import type { Editor } from '@tiptap/react'

import { blockAt, moveBlock, type BlockRef } from '../editor/move'

interface Indicator {
  top: number
  side: 'before' | 'after'
}

/**
 * Block moving without dragging. Pick the grip, then tap the destination: the
 * two-tap flow works with a mouse, a finger, or a keyboard (Escape cancels), and
 * both entry points run the single transaction in move.ts, so it is one undo.
 */
export function BlockMover({ editor, container }: { editor: Editor | null; container: HTMLElement | null }) {
  const [active, setActive] = useState<BlockRef | null>(null)
  const [moving, setMoving] = useState<BlockRef | null>(null)
  const [gripTop, setGripTop] = useState<number | null>(null)
  const [indicator, setIndicator] = useState<Indicator | null>(null)

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

  // Follow the pointer where there is one, the cursor where there is not.
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

  // Placing: capture pointer and click at the document level, so the overlay
  // itself never has to swallow events from the editor.
  useEffect(() => {
    if (!editor || !moving) {
      setIndicator(null)
      return
    }

    const resolve = (event: PointerEvent | MouseEvent) => {
      const pos = editor.view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos
      if (pos == null) return null
      const block = blockAt(editor, pos)
      if (!block) return null
      const coords = editor.view.coordsAtPos(block.pos)
      const side = event.clientY > coords.top + 24 ? 'after' : 'before'
      return { pos, block, side } as const
    }

    const onPointerMove = (event: PointerEvent) => {
      const hit = resolve(event)
      if (!hit) return
      setIndicator({ top: measure(hit.block.pos) ?? 0, side: hit.side })
    }

    const onClick = (event: MouseEvent) => {
      if ((event.target as HTMLElement | null)?.closest('.grip')) return
      const hit = resolve(event)
      event.preventDefault()
      event.stopPropagation()
      if (!hit) {
        setMoving(null)
        return
      }
      moveBlock(editor, moving.pos, hit.pos, hit.side)
      setMoving(null)
    }

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMoving(null)
    }

    document.addEventListener('pointermove', onPointerMove, true)
    document.addEventListener('click', onClick, true)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointermove', onPointerMove, true)
      document.removeEventListener('click', onClick, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [editor, moving, measure])

  const grip = useMemo(() => {
    if (!active || gripTop == null) return null
    return (
      <button
        type="button"
        className={`grip${moving ? ' grip--active' : ''}`}
        style={{ top: `${gripTop}px` }}
        aria-label={moving ? 'Cancel move' : 'Move this block'}
        title={moving ? 'Cancel move (Esc)' : 'Move this block'}
        onPointerDown={(event) => {
          event.preventDefault()
          event.stopPropagation()
        }}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
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
          {indicator ? (
            <div className={`move-line move-line--${indicator.side}`} style={{ top: `${indicator.top}px` }} aria-hidden="true" />
          ) : null}
          <div className="move-hint" role="status">
            Tap where it should go — Esc to cancel
          </div>
        </>
      ) : null}
    </>
  )
}
