import { useCallback, useEffect, useState, type FormEvent } from 'react'

import { api, ApiError, type DocumentMeta } from '../api'
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
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

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

  async function create(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) return
    try {
      const created = await api.createDocument(name.trim())
      setName('')
      navigate(`/d/${created.slug}`)
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : 'could not create that document')
    }
  }

  return (
    <main className="page page--narrow">
      <header className="masthead">
        <h1 className="wordmark">Paddō</h1>
        <p className="muted">Drafts live as plain markdown files on the server.</p>
      </header>

      {error ? (
        <p className="notice notice--error" role="alert">
          {error}
        </p>
      ) : null}

      {documents === null ? (
        <p className="muted">loading…</p>
      ) : documents.length === 0 ? (
        <p className="muted">Nothing here yet. Start something below.</p>
      ) : (
        <ul className="documents">
          {documents.map((document) => (
            <li key={document.slug}>
              <a className="documents__row" href={`/d/${document.slug}`} onClick={(event) => intercept(event, document.slug)}>
                <span className="documents__title">{document.title}</span>
                <span className="documents__meta">
                  {document.words} {document.words === 1 ? 'word' : 'words'} · {when(document.updatedAt)}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}

      <form className="newdoc" onSubmit={create}>
        <label className="field">
          <span className="field__label">New document</span>
          <input
            className="field__input"
            type="text"
            placeholder="A working title"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <button className="button" type="submit" disabled={name.trim().length === 0}>
          Create
        </button>
      </form>
    </main>
  )
}

function intercept(event: React.MouseEvent, slug: string) {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
  event.preventDefault()
  navigate(`/d/${slug}`)
}
