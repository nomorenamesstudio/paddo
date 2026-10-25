# API

Nothing is implemented yet. This file records the contract as it is settled, and
grows as phases land.

## MCP tools (phase 4)

The agent connects to `paddo-mcp` over stdio. It reads `PADDO_URL` and
`PADDO_TOKEN` from the environment.

| Tool | Arguments | Returns |
| --- | --- | --- |
| `list_documents` | — | `[{ slug, title, updatedAt, wordCount }]` |
| `read_document` | `{ document }` | the document as markdown, plus its slug and title |
| `propose_edits` | `{ document, edits: [{ original, proposed, rationale? }], summary? }` | `[{ id, status: "pending" }]`, or per-edit errors |
| `submit_markdown` | `{ document, markdown, rationale? }` | the hunks produced by the server-side diff |

`propose_edits` is the primary path. `original` must be a verbatim substring of the
current document; an empty `original` means an insertion at a located point, and an
empty `proposed` means a deletion. A substring that occurs more than once is
refused, with the match offsets returned so the agent can retry with more context.

`submit_markdown` exists for agents that would rather rewrite the whole document;
the server diffs it against the live document and produces the same hunks. The
file watcher uses the same converter, so a plain `edit` on the `.md` file behaves
like `submit_markdown`.

## HTTP (phase 3)

Planned surface, subject to change until it is built:

| Route | Method | Auth | Purpose |
| --- | --- | --- | --- |
| `/api/login` | POST | password body | sets the signed session cookie |
| `/api/logout` | POST | cookie | clears it |
| `/api/session` | GET | cookie | who am I, for the UI |
| `/api/documents` | GET | cookie or bearer | list `.md` files |
| `/api/documents/:slug` | GET | cookie or bearer | document body and metadata |
| `/api/documents/:slug/suggestions` | GET, POST | cookie or bearer | read pending hunks, ingest new ones |
| `/api/documents/:slug/suggestions/:id` | PATCH | cookie | accept or reject (the client applies the edit itself) |
| `/api/documents/:slug` | POST | cookie | create |
| `/ws` | upgrade | cookie | the Yjs room for a document |

Auth rules: the cookie is `HttpOnly`, `SameSite=Lax`, signed with `PADDO_SECRET`,
and `Secure` only when the origin is HTTPS. The bearer token is accepted only for
the routes marked above, never for `/api/login` or `/ws`.

## Suggestion record

Stored in the room's `suggestions` Y.Map:

```jsonc
{
  "id": "uuid",
  "type": "replace | insert | delete",
  "anchor": "<encoded Yjs relative position, Uint8Array>",
  "end": "<encoded Yjs relative position, Uint8Array or null for insert>",
  "original": "string, for display and stale detection",
  "proposed": "string",
  "rationale": "string | null",
  "status": "pending | accepted | rejected",
  "author": "agent | file",
  "createdAt": 1761000000000
}
```
