import { useEffect, useState } from 'react'
import { Check, Copy, KeyRound, Trash2 } from 'lucide-react'

import { api, ApiError, VERBS, type AgentToken, type DocumentMeta, type Verb } from '../api'

/** The tools live on this origin, so the block never needs a hostname typed by hand. */
function mcpUrl(): string {
  return `${window.location.origin}/mcp`
}

/** What most clients read: Claude Desktop, Cursor, and anything speaking MCP over HTTP. */
function configBlock(secret: string): string {
  return JSON.stringify(
    {
      mcpServers: {
        paddo: {
          type: 'http',
          url: mcpUrl(),
          headers: { Authorization: `Bearer ${secret}` },
        },
      },
    },
    null,
    2,
  )
}

const VERB_LABELS: Record<Verb, string> = {
  read: 'read',
  propose: 'propose edits',
  create: 'create documents',
}

function scopeLabel(token: AgentToken): string {
  if (token.documents === '*') return 'all documents'
  const count = token.documents.length
  return count === 1 ? token.documents[0]! : `${count} documents`
}

function usedLabel(token: AgentToken): string {
  if (!token.lastUsedAt) return 'never used'
  return `used ${new Date(token.lastUsedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
}

/**
 * Tokens for agents that stay connected. A token is the whole permission model: the
 * verbs it holds, and the documents it may touch. The secret is shown once, at the
 * moment it is minted, because only its hash is stored.
 */
export function AgentTokens() {
  const [tokens, setTokens] = useState<AgentToken[]>([])
  const [documents, setDocuments] = useState<DocumentMeta[]>([])
  const [name, setName] = useState('')
  const [verbs, setVerbs] = useState<Verb[]>(['read', 'propose'])
  const [allDocuments, setAllDocuments] = useState(true)
  const [chosen, setChosen] = useState<string[]>([])
  const [secret, setSecret] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    void Promise.all([api.tokens(), api.documents()])
      .then(([tokenList, documentList]) => {
        if (cancelled) return
        setTokens(tokenList.tokens)
        setDocuments(documentList.documents)
      })
      .catch((problem: unknown) => {
        if (cancelled) return
        setError(problem instanceof ApiError ? problem.message : 'could not load tokens')
      })
    return () => {
      cancelled = true
    }
  }, [])

  function toggleVerb(verb: Verb) {
    setVerbs((current) =>
      current.includes(verb) ? current.filter((entry) => entry !== verb) : [...current, verb],
    )
  }

  function toggleDocument(slug: string) {
    setChosen((current) =>
      current.includes(slug) ? current.filter((entry) => entry !== slug) : [...current, slug],
    )
  }

  async function mint() {
    setBusy(true)
    setError(null)
    setCopied(false)
    try {
      const minted = await api.mintToken({
        name: name.trim(),
        verbs,
        documents: allDocuments ? '*' : chosen,
      })
      setTokens((current) => [minted.token, ...current])
      setSecret(minted.secret)
      setName('')
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : 'could not create the token')
    } finally {
      setBusy(false)
    }
  }

  async function revoke(id: string) {
    setError(null)
    try {
      await api.revokeToken(id)
      setTokens((current) => current.filter((token) => token.id !== id))
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : 'could not revoke the token')
    }
  }

  const canMint = name.trim().length > 0 && verbs.length > 0 && (allDocuments || chosen.length > 0)

  return (
    <section className="settings__section">
      <h2 className="settings__heading">Agent tokens</h2>
      <p className="muted settings__note">
        A token lets an agent read and propose against the documents you give it, whenever you tell
        it to — no invitation sheet needed. Copy it into the agent&rsquo;s MCP configuration as{' '}
        <code>PADDO_TOKEN</code>. It is shown once.
      </p>

      <div className="tokens__form">
        <label className="tokens__field">
          <span className="tokens__label">Name</span>
          <input
            className="tokens__input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="case studies agent"
            maxLength={60}
          />
        </label>

        <fieldset className="tokens__group">
          <legend className="tokens__label">Permissions</legend>
          <div className="tokens__choices">
            {VERBS.map((verb) => (
              <label key={verb} className="tokens__choice">
                <input
                  type="checkbox"
                  checked={verbs.includes(verb)}
                  onChange={() => toggleVerb(verb)}
                />
                <span>{VERB_LABELS[verb]}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="tokens__group">
          <legend className="tokens__label">Documents</legend>
          <div className="tokens__choices">
            <label className="tokens__choice">
              <input
                type="radio"
                name="token-scope"
                checked={allDocuments}
                onChange={() => setAllDocuments(true)}
              />
              <span>all documents</span>
            </label>
            <label className="tokens__choice">
              <input
                type="radio"
                name="token-scope"
                checked={!allDocuments}
                onChange={() => setAllDocuments(false)}
              />
              <span>only these</span>
            </label>
          </div>

          {!allDocuments ? (
            <div className="tokens__documents">
              {documents.length === 0 ? <p className="muted">no documents yet</p> : null}
              {documents.map((document) => (
                <label key={document.slug} className="tokens__choice">
                  <input
                    type="checkbox"
                    checked={chosen.includes(document.slug)}
                    onChange={() => toggleDocument(document.slug)}
                  />
                  <span>{document.title}</span>
                </label>
              ))}
            </div>
          ) : null}
        </fieldset>

        <button
          className="button button--primary"
          type="button"
          onClick={() => void mint()}
          disabled={!canMint || busy}
        >
          {busy ? 'Creating…' : 'Create token'}
        </button>
      </div>

      {secret ? (
        <div className="tokens__secret">
          <p>
            <strong>Copy this now.</strong> It is not stored and cannot be shown again. Paste the
            block into your agent&rsquo;s MCP configuration — it is the whole connection.
          </p>
          <div className="tokens__secretrow">
            <pre className="tokens__config">{configBlock(secret)}</pre>
            <button
              className="button"
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(configBlock(secret)).then(() => setCopied(true))
              }}
            >
              {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
              {copied ? 'Copied' : 'Copy config'}
            </button>
          </div>
          <p className="tokens__hint">
            Paddō serves the agent&rsquo;s tools itself at <code>{mcpUrl()}</code>, so nothing has to
            be installed next to the agent.
          </p>
        </div>
      ) : null}

      {tokens.length === 0 ? (
        <p className="muted settings__note">No tokens yet.</p>
      ) : (
        <ul className="tokens__list">
          {tokens.map((token) => (
            <li key={token.id} className="tokens__item">
              <KeyRound size={15} aria-hidden="true" />
              <span className="tokens__name">{token.name}</span>
              <span className="tokens__scope">
                {token.verbs.map((verb) => VERB_LABELS[verb]).join(', ')} · {scopeLabel(token)} ·{' '}
                {usedLabel(token)}
              </span>
              <button
                className="button button--ghost button--icon tokens__revoke"
                type="button"
                onClick={() => void revoke(token.id)}
                aria-label={`Revoke ${token.name}`}
                title="Revoke"
              >
                <Trash2 size={15} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {error ? <p className="notice notice--error">{error}</p> : null}
    </section>
  )
}
