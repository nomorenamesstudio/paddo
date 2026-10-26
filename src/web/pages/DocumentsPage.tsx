import { useCallback, useEffect, useState } from 'react'
import { Plus } from 'lucide-react'

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

  return (
    <main className="page page--narrow">
      <header className="masthead masthead--row">
        <h1 className="wordmark">Paddō</h1>
        <button
          className="button button--icon"
          type="button"
          onClick={create}
          disabled={creating}
          aria-label="New document"
          title="New document"
        >
          <Plus size={20} aria-hidden="true" />
        </button>
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
        <ul className="documents">
          {documents.map((document) => (
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
          ))}
        </ul>
      )}
    </main>
  )
}

function intercept(event: React.MouseEvent, slug: string) {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
  event.preventDefault()
  navigate(`/d/${slug}`)
}
