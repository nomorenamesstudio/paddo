import { useEffect, useState } from 'react'
import { Bot, Check, ChevronDown, Copy, Plug, Trash2 } from 'lucide-react'

import { api, ApiError, type AgentToken, type DocumentMeta, type Verb } from '../api'
import { appUrl } from '../base'
import { copyText, selectElementText } from '../clipboard'

/** The tools live on this origin, so the block never needs a hostname typed by hand. */
function mcpUrl(): string {
  return `${appUrl()}/mcp`
}

/**
 * The other way in: an agent that can run commands needs no config file at all —
 * Paddō is an HTTP API with this token on it. Says what to do, not where to put it.
 */
function agentBrief(secret: string): string {
  const base = appUrl()
  return `You can edit my writing in Paddō, a markdown editor I run at ${base}.

Connect with this bearer token: ${secret}
Paddō serves MCP over HTTP at ${base}/mcp, if your client can register a remote MCP
server (header: "Authorization: Bearer <token>"). Its tools are list_documents,
read_document, propose_edits, create_document and export_document.

If you cannot register an MCP server, call the HTTP API directly with the same token:
  GET  ${base}/api/documents                     which documents the token reaches
  GET  ${base}/api/documents/<slug>              one document, as markdown
  POST ${base}/api/documents/<slug>/suggestions  propose edits
  GET  ${base}/api/documents/<slug>/raw          the exact file, to take away

Edits go through review: send {"edits": [{"original": "…", "proposed": "…"}]} and I
accept or reject each hunk in the editor. "original" must be text you copied verbatim
from the current document — never a guess, never a character offset. For a new file
use POST /api/documents with {"markdown": "…"}.`
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

/** The code is all the agent needs; the token never appears in the conversation. */
function pairBrief(code: string): string {
  const base = appUrl()
  return `I want you to help me edit my writing in Paddō, a markdown editor at ${base}.

It needs pairing first. POST this to ${base}/api/pair/claim with:
  {"code": "${code}"}

While I have not approved it you get HTTP 202 — wait a couple of seconds and ask again.
Once I approve, the same request returns {"token": "paddo_…"}: save it to a file that
survives between your commands (not /tmp), and never print it back to me. If you lose it,
the same code returns it again for ten minutes, so ask me to be re-paired only after that.

Then either register ${base}/mcp as a remote MCP server (header: "Authorization: Bearer
<token>"), or call the HTTP API with it: GET /api/documents, GET /api/documents/<slug>,
POST /api/documents/<slug>/suggestions with {"edits": [{"original": "…", "proposed": "…"}]}.
Quote "original" verbatim from the document; a human approves each hunk in the editor.`
}

/** The permission model in one choice, because three checkboxes asked the reader to
 *  assemble it. Reading is implied at every level: an agent that cannot read cannot
 *  quote anything, and every edit still arrives as a hunk the writer decides on. */
const ACCESS = ['read', 'propose', 'create'] as const
type Access = (typeof ACCESS)[number]

const ACCESS_VERBS: Record<Access, Verb[]> = {
  read: ['read'],
  propose: ['read', 'propose'],
  create: ['read', 'propose', 'create'],
}

const ACCESS_LABELS: Record<Access, string> = {
  read: 'Read only',
  propose: 'Read and edit',
  create: 'Full access',
}

const ACCESS_DESCRIPTIONS: Record<Access, string> = {
  read: 'List and read documents. Nothing changes.',
  propose: 'Read, plus edits that arrive as hunks you accept or reject in the editor.',
  create: 'Read and edit, plus dropping a new markdown document in.',
}

/** A minted token, said as the one choice that would have produced it. */
function accessOf(verbs: Verb[]): string {
  if (verbs.includes('create')) return ACCESS_LABELS.create
  if (verbs.includes('propose')) return ACCESS_LABELS.propose
  return ACCESS_LABELS.read
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
  const [access, setAccess] = useState<Access>('propose')
  const [allDocuments, setAllDocuments] = useState(true)
  const [chosen, setChosen] = useState<string[]>([])
  const [secret, setSecret] = useState<string | null>(null)
  const [pairing, setPairing] = useState<{ code: string; expiresAt: number } | null>(null)
  const [waiting, setWaiting] = useState<
    Array<{ code: string; name: string; state: string; createdAt: number }>
  >([])
  // null until a copy is attempted: the "this browser will not copy" hint is only
  // true after a failure, not before the first click.
  const [copied, setCopied] = useState<boolean | null>(null)
  const [briefCopied, setBriefCopied] = useState<boolean | null>(null)
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

  useEffect(() => {
    if (!pairing) return
    let cancelled = false
    const look = () => {
      void api
        .pairings()
        .then((result) => {
          // Only the pairing this panel started: other codes are not his to approve
          // from here, and a stale one read as "it already happened".
          // Only this pairing, and only once someone has actually claimed it: a row
          // before the claim reads as "it already happened".
          if (!cancelled) {
            setWaiting(
              result.pairings.filter((entry) => entry.code === pairing.code && entry.state === 'claimed'),
            )
          }
        })
        .catch(() => {
          // A failed poll is not worth an error banner; the next one may work.
        })
    }
    look()
    const timer = window.setInterval(look, 2000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [pairing])

  async function pair() {
    setBusy(true)
    setError(null)
    try {
      setPairing(
        await api.startPairing({
          name: name.trim(),
          verbs: ACCESS_VERBS[access],
          documents: allDocuments ? '*' : chosen,
        }),
      )
      setSecret(null)
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : 'could not start the pairing')
    } finally {
      setBusy(false)
    }
  }

  async function approve(code: string) {
    try {
      await api.approvePairing(code)
      setWaiting((current) => current.filter((entry) => entry.code !== code))
      // The token exists now, so the list can show what was granted.
      const refreshed = await api.tokens()
      setTokens(refreshed.tokens)
      setPairing(null)
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : 'could not approve the pairing')
    }
  }

  async function deny(code: string) {
    try {
      await api.denyPairing(code)
      setWaiting((current) => current.filter((entry) => entry.code !== code))
      setPairing(null)
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : 'could not cancel the pairing')
    }
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
    setBriefCopied(false)
    try {
      const minted = await api.mintToken({
        name: name.trim(),
        verbs: ACCESS_VERBS[access],
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

  const canMint = name.trim().length > 0 && (allDocuments || chosen.length > 0)

  return (
    <>
    <section className="settings__card">
      <h2 className="settings__heading settings__heading--icon">
        <Plug size={17} aria-hidden="true" />
        Agent access
      </h2>
      <p className="muted settings__note">
        Let an agent you already use read and change your writing over MCP. Pairing hands the
        token over without it ever passing through a chat log, and the access you pick is what the
        agent can reach — never your files directly.
      </p>

      <div className="agents__grid">
        <label className="agents__field">
          <span className="agents__label">Agent name</span>
          <input
            className="agents__input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="the agent in my laptop"
            maxLength={60}
          />
        </label>

        <label className="agents__field">
          <span className="agents__label">Access</span>
          <span className="agents__selectwrap">
            <select
              className="agents__input agents__select"
              value={access}
              onChange={(event) => setAccess(event.target.value as Access)}
            >
              {ACCESS.map((option) => (
                <option key={option} value={option}>
                  {ACCESS_LABELS[option]}
                </option>
              ))}
            </select>
            <ChevronDown size={15} aria-hidden="true" />
          </span>
        </label>

        <label className="agents__field">
          <span className="agents__label">Documents</span>
          <span className="agents__selectwrap">
            <select
              className="agents__input agents__select"
              value={allDocuments ? '*' : 'some'}
              onChange={(event) => setAllDocuments(event.target.value === '*')}
            >
              <option value="*">All documents</option>
              <option value="some">Select documents</option>
            </select>
            <ChevronDown size={15} aria-hidden="true" />
          </span>
        </label>
      </div>

      <p className="tokens__hint">{ACCESS_DESCRIPTIONS[access]}</p>

      {!allDocuments ? (
        <div className="agents__documents">
          {documents.length === 0 ? <p className="muted">No documents yet.</p> : null}
          {documents.map((document) => (
            <label key={document.slug} className="agents__check">
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

      <div className="agents__buttons">
        <button
          className="button button--primary"
          type="button"
          onClick={() => void pair()}
          disabled={!canMint || busy}
        >
          <Plug size={15} aria-hidden="true" />
          {busy ? 'Working…' : 'Pair an agent'}
        </button>
        <button
          className="button"
          type="button"
          onClick={() => void mint()}
          disabled={!canMint || busy}
        >
          Create a token instead
        </button>
      </div>

      {pairing ? (
        <div className="tokens__secret">
          <p>
            Paste the prompt into the agent. The code inside it is all it needs — nothing happens
            until you approve here, and the token goes straight to the agent, never through chat.
          </p>
          <p className="tokens__pairline">
            code <span className="tokens__paircode">{pairing.code}</span>
            <span className="tokens__hint"> — type it if the agent asks, instead of the whole prompt</span>
          </p>

          <div className="tokens__secretrow">
            <pre className="tokens__brief" tabIndex={0}>
              {pairBrief(pairing.code)}
            </pre>
            <button
              className="button"
              type="button"
              onClick={(event) => {
                void copyText(pairBrief(pairing.code)).then((ok) => {
                  setBriefCopied(ok)
                  if (!ok) selectElementText(event.currentTarget.previousElementSibling as HTMLElement)
                })
              }}
            >
              {briefCopied ? (
                <Check size={15} aria-hidden="true" />
              ) : (
                <Copy size={15} aria-hidden="true" />
              )}
              {briefCopied ? 'Copied' : 'Copy prompt'}
            </button>
          </div>
          {briefCopied === false ? (
            <p className="tokens__hint">
              This browser will not let the page copy (no HTTPS). The prompt above is selected —
              long-press it and copy.
            </p>
          ) : null}

          <p className="tokens__hint">
            {waiting.length === 0
              ? 'Waiting for an agent to claim the code…'
              : 'An agent claimed it. Approve to hand over its token:'}
          </p>
          {waiting.map((entry) => (
            <div key={entry.code} className="tokens__secretrow">
              <span className="tokens__claimant">{entry.name}</span>
              <button
                className="button button--accept"
                type="button"
                onClick={() => void approve(entry.code)}
                aria-label={`Approve ${entry.name}`}
              >
                Approve
              </button>
              <button
                className="button button--danger"
                type="button"
                onClick={() => void deny(entry.code)}
                aria-label={`Deny ${entry.name}`}
              >
                Deny
              </button>
            </div>
          ))}
        </div>
      ) : null}

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
              onClick={(event) => {
                void copyText(configBlock(secret)).then((ok) => {
                  setCopied(ok)
                  if (!ok) selectElementText(event.currentTarget.previousElementSibling as HTMLElement)
                })
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

          <p className="tokens__hint">
            <strong>No config file?</strong> Paste this to the agent instead — it carries the URL,
            the token, and how to reach the documents without MCP at all.
          </p>
          <div className="tokens__secretrow">
            <pre className="tokens__brief" tabIndex={0}>
              {agentBrief(secret)}
            </pre>
            <button
              className="button"
              type="button"
              onClick={(event) => {
                void copyText(agentBrief(secret)).then((ok) => {
                  setBriefCopied(ok)
                  if (!ok) selectElementText(event.currentTarget.previousElementSibling as HTMLElement)
                })
              }}
            >
              {briefCopied ? (
                <Check size={15} aria-hidden="true" />
              ) : (
                <Copy size={15} aria-hidden="true" />
              )}
              {briefCopied ? 'Copied' : 'Copy prompt'}
            </button>
          </div>
          {briefCopied === false ? (
            <p className="tokens__hint">
              This browser will not let the page copy (no HTTPS). The prompt above is selected —
              long-press it and copy.
            </p>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="notice notice--error">{error}</p> : null}
    </section>

    <section className="settings__card">
      <h2 className="settings__heading">Connected agents</h2>

      {tokens.length === 0 ? (
        <p className="muted settings__note tokens__empty">Nothing connected yet.</p>
      ) : (
        <ul className="agents__list">
          {tokens.map((token) => (
            <li key={token.id} className="agents__item">
              <span className="agents__badge" aria-hidden="true">
                <Bot size={16} />
              </span>
              <span className="agents__body">
                <span className="agents__name">{token.name}</span>
                <span className="agents__meta">
                  {accessOf(token.verbs)} · {scopeLabel(token)} · {usedLabel(token)}
                </span>
              </span>
              <button
                className="button button--ghost button--icon agents__revoke"
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

      <p className="tokens__hint">
        Revoking cuts that agent off on its next request. Everything else — your documents, your
        login — stays exactly as it is.
      </p>
    </section>
    </>
  )
}
