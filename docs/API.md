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
| `/api/documents` | GET | cookie or bearer | list `.md` files |
| `/api/documents` | POST | cookie | create: `{ name }` or no body for an untitled draft |
| `/api/documents/:slug` | GET | cookie | title, markdown source and status |
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
- The bearer token (`PADDO_TOKEN`) is accepted on the document and suggestion routes
  and on the WebSocket upgrade. It is never accepted on `/api/login`.
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
