import { useCallback, useEffect, useState } from 'react'
import { ChevronRight, Plus, Search, Settings, X } from 'lucide-react'

import { api, ApiError, type DocumentMeta } from '../api'
import { RowMenu } from '../components/RowMenu'
import { StatusIcon, statusLabel } from '../components/StatusIcon'
import { navigate } from '../App'

function when(ms: number): string {
  const date = new Date(ms)
  const today = new Date()
  const sameDay = date.toDateString() === today.toDateString()
  return sameDay
    ? date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

export function DocumentsPage() {
  const [documents, setDocuments] = useState<DocumentMeta[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [query, setQuery] = useState('')

  const load = useCallback(async () => {
    try {
      const { documents: list } = await api.documents()
      setDocuments(list)
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : 'could not load documents')
      setDocuments([])
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function create() {
    if (creating) return
    setCreating(true)
    try {
      const draft = await api.createDraft()
      navigate(`/d/${draft.slug}`)
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : 'could not create a document')
      setCreating(false)
    }
  }

  // Title only. The slug is a name the writer never chose and never sees — an
  // untitled draft keeps "new-draft-7" forever, and matching it would surface
  // every renamed article on a search for "new".
  const needle = query.trim().toLowerCase()
  const matching = (document: DocumentMeta) =>
    needle === '' || document.title.toLowerCase().includes(needle)

  const active = (documents ?? [])
    .filter((document) => document.status !== 'archived')
    .filter(matching)
  const archived = (documents ?? [])
    .filter((document) => document.status === 'archived')
    .filter(matching)
  const searching = needle !== ''
  const nothingFound = searching && active.length === 0 && archived.length === 0

  const row = (document: DocumentMeta) => (
    <li key={document.slug} className="documents__item">
      <a
        className="documents__row"
        href={`/d/${document.slug}`}
        onClick={(event) => intercept(event, document.slug)}
      >
        <span className="documents__title">{document.title}</span>
        <span className="documents__meta">
          <span className="documents__status" title={statusLabel(document.status)}>
            <StatusIcon status={document.status} size={14} />
          </span>
          {document.words} {document.words === 1 ? 'word' : 'words'} · {when(document.updatedAt)}
        </span>
      </a>
      <RowMenu entry={document} onChanged={() => void load()} />
    </li>
  )

  return (
    <main className="page page--narrow">
      <header className="masthead masthead--row">
        <h1 className="wordmark">Paddō</h1>
        <div className="masthead__actions">
          <a
            className="button button--icon"
            href="/settings"
            aria-label="Settings"
            title="Settings"
            onClick={(event) => {
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
              event.preventDefault()
              navigate('/settings')
            }}
          >
            <Settings size={18} aria-hidden="true" />
          </a>
          <button
            className="button button--icon documents__new"
            type="button"
            onClick={create}
            disabled={creating}
            aria-label="New document"
            title="New document"
          >
            <Plus size={20} aria-hidden="true" />
          </button>
        </div>
      </header>

      {error ? (
        <p className="notice notice--error" role="alert">
          {error}
        </p>
      ) : null}

      {documents === null ? (
        <p className="muted">loading…</p>
      ) : documents.length === 0 ? (
        <p className="muted">Nothing here yet. Start something with the plus above.</p>
      ) : (
        <>
          <div className="search">
            <Search className="search__icon" size={16} aria-hidden="true" />
            <input
              className="search__input"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search documents"
              aria-label="Search documents"
              autoComplete="off"
              spellCheck={false}
            />
            {searching ? (
              <button
                className="search__clear"
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear search"
                title="Clear search"
              >
                <X size={14} aria-hidden="true" />
              </button>
            ) : null}
          </div>

          {nothingFound ? (
            <p className="muted documents__empty">Nothing matches “{query.trim()}”.</p>
          ) : active.length > 0 ? (
            <ul className="documents">{active.map(row)}</ul>
          ) : (
            <p className="muted documents__empty">Everything is archived. Open one and change its status to bring it back.</p>
          )}

          {archived.length > 0 ? (
            <details className="archive">
              <summary className="archive__summary">
                <ChevronRight className="archive__chevron" size={14} aria-hidden="true" />
                <span>Archived</span>
                <span className="archive__count">{archived.length}</span>
              </summary>
              <ul className="archive__list">{archived.map(row)}</ul>
            </details>
          ) : null}
        </>
      )}
    </main>
  )
}

function intercept(event: React.MouseEvent, slug: string) {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
  event.preventDefault()
  navigate(`/d/${slug}`)
}
