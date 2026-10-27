# API

## MCP tools

The agent connects to `paddo-mcp` (`pnpm mcp`) over stdio. It reads `PADDO_URL` and
`PADDO_TOKEN` from the environment and talks to the HTTP API.

| Tool | Arguments | Returns |
| --- | --- | --- |
| `list_documents` | — | `{ documents: [{ slug, title, words, updatedAt, bytes }] }` |
| `read_document` | `{ document }` | the document as markdown, heading first |
| `propose_edits` | `{ document, edits: [{ original, proposed, rationale? }], rationale? }` | `{ created: [{ id, kind, original, proposed }], errors: [] }` |
| `submit_markdown` | `{ document, markdown, rationale? }` | the hunks produced by the server-side diff |
| `pending_suggestions` | `{ document }` | hunks still awaiting a human decision |
| `create_document` | `{ markdown, name? }` | the new `{ slug, title, words }`; refuses an existing name |
| `export_document` | `{ document }` | the exact markdown, no commentary: what a download contains |

`propose_edits` is the primary path. `original` must be a verbatim substring of the
current document. A substring that occurs more than once is refused, so the agent
retries with more context rather than the server guessing. A pure insertion is not
supported on its own: the agent quotes the text the insertion belongs beside.

`submit_markdown` exists for agents that would rather rewrite the whole document; the
server diffs it against the live document. The file watcher uses the same converter,
so a plain edit on the `.md` file behaves exactly like `submit_markdown`.

## HTTP

| Route | Method | Auth | Purpose |
| --- | --- | --- | --- |
| `/healthz` | GET | none | liveness, no document data |
| `/api/session` | GET | none | `{ authenticated }` for the UI |
| `/api/login` | POST | password body | sets the signed session cookie |
| `/api/logout` | POST | cookie | clears it |
| `/api/documents` | GET | cookie or bearer | list `.md` files (a scoped token sees only its own) |
| `/api/documents` | POST | cookie, or token with `create` | create: `{ name }`, `{ markdown, name? }`, or no body for an untitled draft |
| `/api/documents/:slug` | GET | cookie or bearer | title, markdown source and status |
| `/api/documents/:slug/raw` | GET | cookie or bearer | the markdown as `text/markdown`, `attachment; filename="<slug>.md"`, live edits included |
| `/api/tokens` | GET | cookie | minted agent tokens, without their hashes |
| `/api/tokens` | POST | cookie | mint: `{ name, verbs, documents }` → `{ token, secret }`, the secret shown once |
| `/api/tokens/:id` | DELETE | cookie | revoke |
| `/api/documents/:slug` | PATCH | cookie | `{ status }`: draft, editing, published or archived |
| `/api/documents/:slug` | DELETE | cookie | removes the markdown, the sidecar and the status |
| `/api/settings` | GET | cookie | `{ writingGuide, theme }` |
| `/api/settings` | PUT | cookie | `{ writingGuide, theme }` — guide up to 20 000 characters, theme `system`/`light`/`dark` |
| `/api/documents/:slug/suggestions` | GET | cookie or bearer | pending hunks |
| `/api/documents/:slug/suggestions` | POST | cookie or bearer | ingest `{ edits }` or `{ markdown }` |
| `/api/documents/:slug/suggestions/:id` | PATCH | cookie | `{ status: "rejected" \| "accepted" }` |
| `/ws` | upgrade | cookie **or** `?token=` / `Authorization: Bearer` | the Yjs room for a document |

Auth rules:

- The session cookie is `HttpOnly`, `SameSite=Lax`, signed with `PADDO_SECRET`, and
  `Secure` only when the request came over HTTPS. It carries `<expiry>.<hmac>`; there
  is no session store.
- The shared password is compared in constant time and throttled to five attempts a
  minute per address.
- Two kinds of bearer token are accepted on the document and suggestion routes and on
  the WebSocket upgrade, never on `/api/login`:
  - `PADDO_TOKEN` from the environment — the machine's own key: every verb, every
    document.
  - A **minted token** (`paddo_…`): the verbs it holds (`read`, `propose`, `create`)
    and the documents in its scope (`"*"` or a list of slugs). Only the SHA-256 of
    the secret is stored; the secret itself is returned once, by `POST /api/tokens`.
- A minted token is judged on its own: an out-of-scope slug is `403`, a missing verb
  is `403`, a session-only route (`/api/tokens`, settings, status, delete) is `401`.
  A request carrying both a session cookie and a token is the owner's session, and
  gets everything, which is why a token test has to use a cookie-free client.
- Creating a document with a token adds that document to the token's scope, so an
  agent can read back what it dropped in.
- A WebSocket upgrade without a valid cookie or token is refused at the socket with
  a 401; `onAuthenticate` checks again once the protocol starts.
- The server refuses to boot without `PADDO_PASSWORD`, `PADDO_SECRET` and
  `PADDO_TOKEN`.

## Suggestion record

Stored in the room's `suggestions` Y.Map:

```jsonc
{
  "id": "uuid",
  "kind": "replace | insert | delete",
  "from": "Uint8Array — encoded Yjs relative position at the start",
  "to": "Uint8Array — encoded position after the range, null for a pure insert",
  "original": "string, for display, stale detection and re-anchoring",
  "proposed": "string",
  "rationale": "string | null",
  "status": "pending | accepted | rejected",
  "author": "agent | file",
  "createdAt": 1761000000000
}
```
