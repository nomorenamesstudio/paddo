import { useEffect, useState } from 'react'

import type { Editor } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import { Bold, Check, Italic, Link2, Unlink } from 'lucide-react'

/**
 * The small formatting set, on the selection itself. This is the only way to make
 * a link on a phone — a keyboard shortcut is not available there — so it appears
 * for touch selections too.
 */
export function SelectionMenu({ editor }: { editor: Editor | null }) {
  const [linkMode, setLinkMode] = useState(false)
  const [href, setHref] = useState('')

  useEffect(() => {
    const onShortcut = () => {
      if (!editor) return
      setHref(String(editor.getAttributes('link').href ?? 'https://'))
      setLinkMode(true)
    }
    window.addEventListener('paddo:link', onShortcut)
    return () => window.removeEventListener('paddo:link', onShortcut)
  }, [editor])

  useEffect(() => {
    if (!linkMode) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setLinkMode(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [linkMode])

  if (!editor) return null

  const applyLink = () => {
    const value = href.trim()
    if (!value) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: value }).run()
    }
    setLinkMode(false)
  }

  return (
    <BubbleMenu
      editor={editor}
      options={{ placement: 'top', offset: 16 }}
      className="bubble"
      shouldShow={({ editor: current, state }) =>
        !state.selection.empty && !current.isActive('codeBlock')
      }
    >
      {linkMode ? (
        <div className="bubble__link">
          <input
            className="bubble__input"
            type="url"
            inputMode="url"
            autoFocus
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
        </div>
      ) : (
        <>
          <button
            type="button"
            className={`bubble__button${editor.isActive('bold') ? ' is-active' : ''}`}
            onClick={() => editor.chain().focus().toggleBold().run()}
            aria-label="Bold"
            title="Bold"
          >
            <Bold size={18} />
          </button>
          <button
            type="button"
            className={`bubble__button${editor.isActive('italic') ? ' is-active' : ''}`}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            aria-label="Italic"
            title="Italic"
          >
            <Italic size={18} />
          </button>
          <button
            type="button"
            className={`bubble__button${editor.isActive('link') ? ' is-active' : ''}`}
            onClick={() => {
              setHref(String(editor.getAttributes('link').href ?? 'https://'))
              setLinkMode(true)
            }}
            aria-label="Link"
            title="Link"
          >
            <Link2 size={18} />
          </button>
          {editor.isActive('link') ? (
            <button
              type="button"
              className="bubble__button"
              onClick={() => editor.chain().focus().unsetLink().run()}
              aria-label="Remove link"
              title="Remove link"
            >
              <Unlink size={18} />
            </button>
          ) : null}
        </>
      )}
    </BubbleMenu>
  )
}
