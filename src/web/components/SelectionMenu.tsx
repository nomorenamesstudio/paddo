import { useEffect, useRef, useState, type ReactNode } from 'react'

import type { Editor } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import {
  Bold,
  Check,
  ChevronLeft,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link2,
  Quote,
  Unlink,
} from 'lucide-react'

type Mode = 'format' | 'link' | 'heading'

const HEADING_LEVELS = [1, 2, 3] as const

/**
 * The small formatting set, on the selection itself: bold, italics, a link, a
 * blockquote, and h1–h3. This is the only way to reach any of it on a phone,
 * where a keyboard shortcut does not exist, so every control is thumb sized and
 * the heading row swaps in rather than widening the bar off screen.
 */
export function SelectionMenu({ editor }: { editor: Editor | null }) {
  const [mode, setMode] = useState<Mode>('format')
  const [href, setHref] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const onShortcut = () => {
      if (!editor) return
      setHref(String(editor.getAttributes('link').href ?? 'https://'))
      setMode('link')
    }
    window.addEventListener('paddo:link', onShortcut)
    return () => window.removeEventListener('paddo:link', onShortcut)
  }, [editor])

  useEffect(() => {
    if (mode === 'format') return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMode('format')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode])

  useEffect(() => {
    if (mode === 'link') inputRef.current?.focus()
  }, [mode])

  if (!editor) return null

  const applyLink = () => {
    const value = href.trim()
    if (!value || value === 'https://') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: value }).run()
    }
    setMode('format')
  }

  const action = (label: string, icon: ReactNode, onClick: () => void, active = false) => (
    <button
      type="button"
      className={`bubble__button${active ? ' is-active' : ''}`}
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      {icon}
    </button>
  )

  const headingIcon = (level: 1 | 2 | 3) =>
    level === 1 ? <Heading1 size={18} /> : level === 2 ? <Heading2 size={18} /> : <Heading3 size={18} />

  return (
    <BubbleMenu
      editor={editor}
      options={{ placement: 'top', offset: 16 }}
      className="bubble"
      shouldShow={({ editor: current, state }) =>
        !state.selection.empty && !current.isActive('codeBlock')
      }
    >
      {mode === 'link' ? (
        <div className="bubble__link">
          <input
            ref={inputRef}
            className="bubble__input"
            type="url"
            inputMode="url"
            placeholder="https://"
            value={href}
            onChange={(event) => setHref(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                applyLink()
              }
            }}
          />
          <button type="button" className="bubble__button" onClick={applyLink} aria-label="Apply link">
            <Check size={18} />
          </button>
          {action('Back', <ChevronLeft size={18} />, () => setMode('format'))}
        </div>
      ) : mode === 'heading' ? (
        <>
          {HEADING_LEVELS.map((level) =>
            action(
              `Heading ${level}`,
              headingIcon(level),
              () => editor.chain().focus().toggleHeading({ level }).run(),
              editor.isActive('heading', { level }),
            ),
          )}
          {action('Back', <ChevronLeft size={18} />, () => setMode('format'))}
        </>
      ) : (
        <>
          {action('Bold', <Bold size={18} />, () => editor.chain().focus().toggleBold().run(), editor.isActive('bold'))}
          {action(
            'Italic',
            <Italic size={18} />,
            () => editor.chain().focus().toggleItalic().run(),
            editor.isActive('italic'),
          )}
          {action(
            'Link',
            <Link2 size={18} />,
            () => {
              setHref(String(editor.getAttributes('link').href ?? 'https://'))
              setMode('link')
            },
            editor.isActive('link'),
          )}
          {editor.isActive('link')
            ? action('Remove link', <Unlink size={18} />, () => editor.chain().focus().unsetLink().run())
            : null}
          {action(
            'Blockquote',
            <Quote size={18} />,
            () => editor.chain().focus().toggleBlockquote().run(),
            editor.isActive('blockquote'),
          )}
          {action('Headings', headingIcon(1), () => setMode('heading'), editor.isActive('heading'))}
        </>
      )}
    </BubbleMenu>
  )
}
