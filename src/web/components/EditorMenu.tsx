import { Download, MoreVertical, Sparkles } from 'lucide-react'

import { api } from '../api'
import { useMenu } from './useMenu'

/**
 * The writing bar's menu: the agent invitation, and the file itself. Both are about
 * the document you are in, so they live here rather than in Settings.
 */
export function EditorMenu({ slug, onInvite }: { slug: string; onInvite: () => void }) {
  const { open, setOpen, root } = useMenu()

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

          {/* A real download: the browser fetches the file the server serves. */}
          <a
            href={api.rawUrl(slug)}
            download={`${slug}.md`}
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
