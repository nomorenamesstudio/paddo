import { useState } from 'react'
import { Check, Copy, Download, MoreVertical, Sparkles } from 'lucide-react'

import { api } from '../api'
import { copyText } from '../clipboard'
import { useMenu } from './useMenu'

/**
 * The writing bar's menu: the agent invitation, and the file itself. Both are about
 * the document you are in, so they live here rather than in Settings.
 *
 * Copy and download sit together on purpose: the same text leaves the app two ways, for
 * a clipboard that a pipeline reads and for a file that a person keeps. Both ask the raw
 * route, so both carry the live room's text rather than the last save's.
 */
export function EditorMenu({ slug, onInvite }: { slug: string; onInvite: () => void }) {
  const { open, setOpen, root } = useMenu()
  const [copied, setCopied] = useState(false)

  const notice = (detail: string) =>
    window.dispatchEvent(new CustomEvent('paddo:notice', { detail }))

  /**
   * The whole document as markdown, on the clipboard, exactly as the file would be. One
   * request rather than a client-side re-serialization: the same bytes the download has.
   */
  async function copyMarkdown() {
    setOpen(false)
    try {
      const response = await fetch(api.rawUrl(slug), { credentials: 'same-origin' })
      if (!response.ok) throw new Error(String(response.status))
      const markdown = await response.text()
      if (!(await copyText(markdown))) {
        notice('This browser will not let the page copy without HTTPS.')
        return
      }
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      notice('Could not copy the markdown.')
    }
  }

  return (
    <div className="row-menu editor-menu" ref={root}>
      <button
        className="button button--ghost button--icon row-menu__trigger editor-menu__trigger"
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Document actions"
        title="Document actions"
      >
        <MoreVertical size={20} aria-hidden="true" />
      </button>

      {open ? (
        <div className="row-menu__panel" role="menu" aria-label="Document actions">
          <button
            type="button"
            role="menuitem"
            className="row-menu__item"
            onClick={() => {
              setOpen(false)
              onInvite()
            }}
          >
            <Sparkles size={16} aria-hidden="true" />
            <span>Invite the agent</span>
          </button>

          <button
            type="button"
            role="menuitem"
            className="row-menu__item"
            onClick={() => void copyMarkdown()}
          >
            {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
            <span>{copied ? 'Copied' : 'Copy markdown'}</span>
          </button>

          {/* No `download` attribute: the server names the file after the document's title,
              and an attribute here would override that with the slug. */}
          <a
            href={api.rawUrl(slug)}
            role="menuitem"
            className="row-menu__item"
            onClick={() => setOpen(false)}
          >
            <Download size={16} aria-hidden="true" />
            <span>Download markdown</span>
          </a>
        </div>
      ) : null}
    </div>
  )
}
