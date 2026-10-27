import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import Collaboration from '@tiptap/extension-collaboration'
import CollaborationCaret from '@tiptap/extension-collaboration-caret'
import { EditorContent, useEditor } from '@tiptap/react'
import { buildInvitePrompt } from '../../shared/invite'
import { SUGGESTIONS_MAP, type Suggestion } from '../../shared/suggestions'
import { CONTENT_FIELD, baseExtensions } from '../../shared/editor'
import { api } from '../api'
import { caretRenderer, deviceKind } from '../editor/caret'
import { createCollab, type Collab } from '../editor/collab'
import {
  acceptAllSuggestions,
  acceptSuggestion,
  diagnoseSuggestions,
  pruneDeadSuggestions,
  rejectAllSuggestions,
} from '../editor/actions'
import { DragPreviewExtension } from '../editor/drag-preview'
import { Suggestions } from '../editor/suggestions'
import { Bot } from 'lucide-react'

import { BlockMover } from '../components/BlockMover'
import { LoadingDocument, humanizeSlug } from '../components/LoadingDocument'
import { TopBar } from '../components/TopBar'
import { SelectionMenu } from '../components/SelectionMenu'
import { InviteSheet } from './InviteSheet'
import type { HeadlinePhase } from '../components/Headline'

/** Who the other device is, rather than a name that means nothing on a shared doc. */
export function deviceName(): string {
  const coarse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches
  return coarse ? 'Phone' : 'Desktop'
}

export function EditorPage({ slug }: { slug: string }) {
  const [collab, setCollab] = useState<Collab | null>(null)

  useEffect(() => {
    const instance = createCollab(slug)
    setCollab(instance)
    return () => instance.destroy()
  }, [slug])

  if (!collab) {
    return (
      <main className="page page--narrow">
        <p className="muted">opening…</p>
      </main>
    )
  }

  return <EditorSurface slug={slug} collab={collab} />
}

import type { SyncState } from '../components/TopBar'

function EditorSurface({ slug, collab }: { slug: string; collab: Collab }) {
  // Named from the slug straight away, so an existing article never flashes as
  // "New draft" while the socket is still connecting.
  const [title, setTitle] = useState(() => humanizeSlug(slug))
  const [sync, setSync] = useState<SyncState>(collab.provider.isSynced ? 'connected' : 'connecting')
  // Crossfade: the placeholder fades out while the document fades in, rather than
  // one snapping away and the other snapping on.
  const ready = sync === 'connected'
  const [showSkeleton, setShowSkeleton] = useState(true)
  const [skeletonFading, setSkeletonFading] = useState(false)

  useEffect(() => {
    if (!ready) return
    setSkeletonFading(true)
    const timer = window.setTimeout(() => setShowSkeleton(false), 200)
    return () => window.clearTimeout(timer)
  }, [ready])
  const [pending, setPending] = useState(0)
  // Only ever the truth: a room that is already synced opens straight on the title, and
  // a fresh one starts where it is — still connecting.
  const [headlinePhase, setHeadlinePhase] = useState<HeadlinePhase>(
    collab.provider.isSynced ? 'title' : 'syncing',
  )
  const [inviteOpen, setInviteOpen] = useState(false)
  const [writingGuide, setWritingGuide] = useState('')
  const [includeGuide, setIncludeGuide] = useState(
    () => window.localStorage.getItem('paddo-include-guide') !== 'no',
  )
  const [noteOpen, setNoteOpen] = useState(
    () => window.localStorage.getItem('paddo-invite-note') !== 'hidden',
  )
  const [notice, setNotice] = useState<string | null>(null)
  const editorHost = useRef<HTMLElement | null>(null)

  const editor = useEditor(
    {
      extensions: [
        ...baseExtensions({ collaborative: true }),
        Collaboration.configure({ document: collab.doc, field: CONTENT_FIELD }),
        CollaborationCaret.configure({
          provider: collab.provider,
          user: { name: deviceName(), device: deviceKind(), color: '#9a3412' },
          render: caretRenderer,
        }),
        Suggestions.configure({ ydoc: collab.doc }),
        DragPreviewExtension,
      ],
      editorProps: {
        attributes: {
          class: 'prose',
          spellcheck: 'true',
          autocapitalize: 'sentences',
          'aria-label': 'Document',
        },
        handleKeyDown: (_view, event) => {
          if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
            event.preventDefault()
            window.dispatchEvent(new CustomEvent('paddo:link'))
            return true
          }
          return false
        },
      },
    },
    [collab],
  )

  // Reopen where you stopped typing, not at the top of the file.
  const restoredCursor = useRef(false)
  useEffect(() => {
    if (!editor || restoredCursor.current) return
    const key = `paddo:cursor:${slug}`
    const saved = Number(window.localStorage.getItem(key))
    restoredCursor.current = true
    if (editor.isEmpty) return
    const target = Number.isFinite(saved) && saved > 0 ? Math.min(saved, editor.state.doc.content.size) : null
    requestAnimationFrame(() => {
      if (target !== null) editor.commands.setTextSelection(target)
    })
  }, [editor, slug])

  useEffect(() => {
    if (!editor) return
    const key = `paddo:cursor:${slug}`
    const save = () => window.localStorage.setItem(key, String(editor.state.selection.head))
    editor.on('selectionUpdate', save)
    return () => {
      editor.off('selectionUpdate', save)
    }
  }, [editor, slug])

  // Debug handle: lets a headless browser inspect the live editor and its Y.Doc.
  useEffect(() => {
    const handle = window as unknown as Record<string, unknown>
    handle.__paddo = { editor, collab }
    handle.__paddoDiagnostics = () => (editor ? diagnoseSuggestions(editor) : null)
    handle.__paddoAccept = (id: string) => (editor ? acceptSuggestion(editor, id) : 'no-editor')
  }, [editor, collab])

  // The document's name is its first heading: type one and the title follows.
  useEffect(() => {
    if (!editor) return
    const readTitle = () => {
      let found = ''
      editor.state.doc.descendants((node) => {
        if (found) return false
        if (node.type.name === 'heading' && node.attrs.level === 1) {
          found = node.textContent.trim()
        }
        return true
      })
      // No heading yet: keep whatever name the document already has.
      if (found) setTitle(found)
    }
    readTitle()
    editor.on('update', readTitle)
    return () => {
      editor.off('update', readTitle)
    }
  }, [editor])

  useEffect(() => {
    let cancelled = false
    void api
      .document(slug)
      .then((document) => {
        if (cancelled) return
        setTitle(document.title)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [slug])

  // Feedback channel for actions that happen inside ProseMirror decorations.
  useEffect(() => {
    const onNotice = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail
      if (typeof detail === 'string') setNotice(detail)
    }
    window.addEventListener('paddo:notice', onNotice)
    return () => window.removeEventListener('paddo:notice', onNotice)
  }, [])

  // Hooks that can never be applied are dropped once the document is really here.
  useEffect(() => {
    if (!editor || sync !== 'connected') return
    const timer = window.setTimeout(() => pruneDeadSuggestions(editor), 1200)
    return () => window.clearTimeout(timer)
  }, [editor, sync])

  // Provider status.
  useEffect(() => {
    const provider = collab.provider
    const onSynced = () => setSync('connected')
    const onStatus = ({ status }: { status: string }) => {
      if (status === 'connected') setSync(provider.isSynced ? 'connected' : 'connecting')
      else if (status === 'disconnected') setSync('disconnected')
      else setSync('connecting')
    }
    const onAuthFailed = () => {
      setNotice('Your session expired. Reload to sign in again.')
      setSync('disconnected')
    }

    provider.on('synced', onSynced)
    provider.on('status', onStatus)
    provider.on('authenticationFailed', onAuthFailed)
    return () => {
      provider.off('synced', onSynced)
      provider.off('status', onStatus)
      provider.off('authenticationFailed', onAuthFailed)
    }
  }, [collab])

  // Pending count: the suggestions live in the Y.Doc, shared with every device.
  useEffect(() => {
    const map = collab.doc.getMap<Record<string, unknown>>(SUGGESTIONS_MAP)
    const update = () => {
      const count = [...map.values()].filter(
        (value) => (value as unknown as Suggestion).status === 'pending',
      ).length
      setPending(count)
    }
    update()
    map.observe(update)
    return () => map.unobserve(update)
  }, [collab])

  // iOS suspends the socket when the PWA goes to the background; on return,
  // reconnect rather than leaving a silent dead page.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !collab.provider.isSynced) {
        collab.provider.connect()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [collab])

  // Rebuilt when the title changes: the sheet names the document the writer sees,
  // while the tool calls keep using the slug.
  // Rebuilt when the title or the guide changes: the sheet names the document the
  // writer sees, the tool calls keep the slug, and the guide carries their voice.
  const invitePrompt = useMemo(
    () => buildInvitePrompt(slug, title, window.location.origin, includeGuide ? writingGuide : ''),
    [slug, title, writingGuide, includeGuide],
  )

  // The header says what is happening, then gets out of the way: the title appears a
  // couple of seconds after the document is ready, never before it. Any drop and
  // reconnect plays the whole sequence again, because the state is the dependency.
  useEffect(() => {
    if (sync !== 'connected') {
      setHeadlinePhase('syncing')
      return
    }
    setHeadlinePhase('synced')
    const timer = window.setTimeout(() => setHeadlinePhase('title'), 1400)
    return () => window.clearTimeout(timer)
  }, [sync])

  const acceptAll = useCallback(() => {
    if (!editor) return
    const applied = acceptAllSuggestions(editor)
    if (applied === 0) setNotice('Nothing could be applied — the text moved under every hunk.')
  }, [editor])

  const rejectAll = useCallback(() => {
    if (!editor) return
    rejectAllSuggestions(editor)
  }, [editor])

  return (
    <>
      {/* A modal hides the page behind it from pointers, focus and screen readers. */}
      <div className="shell" inert={inviteOpen}>
        <TopBar
        title={title}
        sync={sync}
        phase={headlinePhase}
        actions={
          <span className="topbar__actions">
            <button
              className="button button--ghost button--icon"
              type="button"
              onClick={() => {
                setInviteOpen(true)
                // Fetched on demand: most sessions never open this sheet.
                void api
                  .getSettings()
                  .then((settings) => setWritingGuide(settings.writingGuide))
                  .catch(() => setWritingGuide(''))
              }}
              aria-label="Invite the agent"
              title="Invite the agent"
            >
              <Bot size={20} aria-hidden="true" />
            </button>
          </span>
        }
      />

      {notice ? (
        <p className="notice" role="status">
          {notice}
          <button className="notice__close" type="button" onClick={() => setNotice(null)} aria-label="Dismiss">
            ×
          </button>
        </p>
      ) : null}

      <main className="editor" ref={editorHost} onClick={() => editor?.commands.focus()}>
        {showSkeleton ? <LoadingDocument fading={skeletonFading} /> : null}
        <div className={`editor__body${ready ? ' is-ready' : ''}`}>
          <EditorContent editor={editor} />
        </div>
        <SelectionMenu editor={editor} />
        <BlockMover editor={editor} container={editorHost.current} />
      </main>

      {pending > 0 ? (
        <div className="bottombar" role="region" aria-label="Pending suggestions">
          <span className="bottombar__count">{pending} pending</span>
          <div className="bottombar__actions">
            <button className="button button--danger" type="button" onClick={rejectAll}>
              Reject all
            </button>
            <button className="button button--accept" type="button" onClick={acceptAll}>
              Accept all
            </button>
          </div>
        </div>
      ) : null}
      </div>

      {inviteOpen ? (
        <InviteSheet
          title={title}
          guide={writingGuide}
          includeGuide={includeGuide}
          onToggleGuide={(next) => {
            setIncludeGuide(next)
            // Remembered per browser: a writer who skips the guide once means it.
            window.localStorage.setItem('paddo-include-guide', next ? 'yes' : 'no')
          }}
          noteOpen={noteOpen}
          onDismissNote={() => {
            setNoteOpen(false)
            window.localStorage.setItem('paddo-invite-note', 'hidden')
          }}
          onRestoreNote={() => {
            setNoteOpen(true)
            window.localStorage.setItem('paddo-invite-note', 'shown')
          }}
          prompt={invitePrompt}
          onClose={() => setInviteOpen(false)}
          onCopied={() => setNotice('Prompt copied. Paddō will show the hunks when the agent sends them.')}
        />
      ) : null}
    </>
  )
}

