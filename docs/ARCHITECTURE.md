# Architecture

## Shape

One Node 22 process, one port, one socket.

```
phone ──┐                        ┌─ Fastify ─── static PWA, JSON API, cookies
        ├── HTTP  ── one port ───┤
desktop ┘                        └─ Hocuspocus ─ Yjs rooms (WebSocket upgrade)

                Fastify owns the socket; Hocuspocus' upgrade listener is invoked
                from it, and the upgrade is refused outright without a credential.

per document room:  Y.Doc ──┬── Y.XmlFragment  "content"      the prose
                            └── Y.Map          "suggestions"  pending hunks

disk:               content/<slug>.md        canonical prose, plain markdown
                    .paddo/<slug>.y          Yjs update log (anchors need it)
```

The agent sits outside all of it:

```
agent session ── stdio ── paddo-mcp ── HTTP ── /api/documents/:slug/suggestions
```

## Decisions that are not obvious from the code

**The `.md` file is canonical for prose, but not for anchors.** A Yjs relative
position is an id into CRDT history. Serialize the document to markdown, throw the
CRDT away, and every stored anchor is meaningless on the next boot. So the prose
lives in `.md` where a human can read and grep it, and a `.paddo/<slug>.y` sidecar
keeps the CRDT identity alive. Delete the sidecar and pending suggestions are
dropped on load — never silently re-attached to text that has moved.

**Suggestions live inside the Y.Doc, in a second root type.** They sync to every
device for free, they survive a restart with the sidecar, and a review on the phone
is visible on the desktop without any extra channel. The `.md` file never contains
them, so the prose on disk is always clean.

**The agent's wire format is quote-anchored, not offset-anchored.** A language model
cannot reliably emit character indices into a document it has not counted. It can
copy a substring verbatim. So a hunk arrives as `{ original, proposed, rationale }`,
the server locates `original` in the live document, converts that to a Yjs relative
position, and stores the anchor. An ambiguous match is refused with the match count,
so the agent retries with more context rather than the server guessing.

**The server never applies edits.** Accepting a suggestion is a ProseMirror
transaction on the client that originated it; Yjs carries it to every other device
and the server only observes the change to rewrite the `.md`. That is why the
server can do its whole job without a DOM, a ProseMirror view, or a position
mapping: it creates anchors from flat text, and the client converts them to document
positions with the real binding.

**Two writers, one authority.** The server writes the `.md` from the CRDT; the file
watcher exists for agents that just edit the file. Three rules keep them apart:

1. the server records the hash of what it wrote, and ignores the watcher event that
   carries that hash;
2. before writing, it compares the file on disk with what it last wrote — if they
   differ, someone else edited it, so it writes the sidecar only and lets the
   watcher turn that edit into suggestions rather than overwriting the change;
3. a document the server has never seen is adopted from the file as-is; there is no
   "previous version" to diff against, so no suggestions are invented for it.

**Suggestion colours mean one thing.** Struck text is the text that would be removed,
the chip or card holds the text that would replace it. Nothing is highlighted merely
to look like a diff.

## File names follow the title

A document is born with a temporary slug (`new-draft-3`) and keeps it while it is being
written, because the slug is three things at once: the filename, the CRDT room name and
the URL. Renaming mid-session would leave a connected editor holding a room that no
longer exists on disk — so the rename happens in `afterUnloadDocument`, the one moment
with no client attached to the old name: the markdown, the `.y` sidecar and the
`.meta.json` move together — sidecar first, so the watcher never sees the markdown under
a new name while the CRDT state is still under the old one. `freeSlug` picks `title-2`
when another document already holds the name, which is why untitled drafts settle on
`new-draft`, `new-draft-2`: their title is "New draft", and the name follows the title.

The catch: an old `/d/new-draft-6` bookmark 404s after the rename. The list always links
to the current name.

## The agent connects to a token, not to a document

A persistent agent is not a session with its own socket. `paddo-mcp` is a stdio
process the harness keeps alive, and it calls the HTTP API on demand — "edit my
case study" works whenever the writer says it, because the tools can list and read
documents then.

What makes that safe is the token, not the connection:

- A token carries verbs (`read`, `propose`, `create`) and a document scope, and the
  server enforces both on every request. The scope is the blast radius, so revoking
  a token is a complete answer to a leaked one.
- The agent adds text one of two ways. `create_document` writes a new file outright
  and joins the token's scope; everything else goes through `propose_edits`, which
  lands as hunks a human accepts. That split is deliberate: an agent may put a draft
  in, it may never silently rewrite prose that already exists.
- Nothing pushes. MCP tools are request/response, so a server cannot wake a model
  when a document changes. An agent that needs to know what changed asks on its next
  call. A pull is enough because the writer is the one who decides when to ask.
- The file watcher still exists for an agent that edits `.md` on disk by hand: the
  diff becomes suggestions. It is a fallback, never the intended path, because a
  direct write races the CRDT store.

## Traps found the hard way

Each of these cost time during the build, and each is guarded by code or a test.

| Trap | What happens | Guard |
| --- | --- | --- |
| `PluginKey` identity across bundles | Tiptap's Collaboration extension installs y-prosemirror's sync plugin, but `ySyncPluginKey.getState()` returns `undefined` because the key object in the editor is not the one the app imported. Suggestions silently never rendered | find the plugin by its string key `y-sync$`, then ask the plugin for its state (`src/web/editor/actions.ts`) |
| Widget buttons dying mid-click | ProseMirror replaces decoration nodes on every transaction, so a `mousedown` that triggers a re-render detaches the button before its `click` fires | one delegated `pointerdown` listener on the editor root, buttons carry `data-sug-action` |
| Precache serving a stale app shell | with the service worker registered on `localhost`, every rebuild appeared to do nothing | the service worker only registers on a real HTTPS origin, never on localhost or the LAN |
| A store overwriting a fresh file edit | Hocuspocus stores on unload, so an unrelated request could rewrite the `.md` and erase an external edit | compare the disk hash with the last hash the server wrote before writing |
| Diff swallowing untouched prose | a merge buffer pulled the rest of the paragraph into every hunk, so a one-word change showed a 300-character diff | the unchanged gap is only committed when a *later* change follows (`src/server/diff.ts`) |
| Anchoring past the last character | appending a paragraph produced a hunk at `text.length`, which anchored to nothing and dropped the suggestion | `anchorRange` clamps to the last real character and walks separators |
| Resetting a sidecar with clients connected | the room is re-seeded from markdown under a **new** CRDT lineage while an open tab still holds the old one; when they sync, Yjs merges both lineages by concatenation and the document appears two, three, five times over | stop the server and close every client before deleting `.paddo/<slug>.y`; recovery is a Y-level delete of the repeated blocks (`spike/dedupe-doc.mjs`) |
| Static assets registered at boot | `@fastify/static` with `wildcard: false` builds its route table at startup, so newly built asset hashes 404 until a restart | wildcard matching, with the SPA fallback in `setNotFoundHandler` |

## Verified by tests

`pnpm test` (vitest) covers the three pieces that are pure logic and easy to break:
markdown round-trip byte stability, quote anchoring (unique, ambiguous, after an
edit, across a restart, at the end of the document), and diff hunk shape.

`pnpm test:e2e` (Playwright) covers what only a browser can: the login gate, typing
reaching the markdown file, a proposal reviewed inline and applied, reject-one and
accept-all, and an unauthenticated WebSocket being refused.

## Known limits

- The server cannot resolve a Yjs anchor to a ProseMirror position, and does not
  need to. Anything that does (decorations, accept) is client work.
- Two devices accepting overlapping hunks at the same instant: last writer wins on
  the text; the losing hunk is re-checked on the next render and refused as stale
  rather than applied twice.
- Markdown fidelity is verified against prose. Tables and code blocks are out of
  scope for v1 and their round-trip is not covered.
- iOS backgrounding: the socket is re-opened on `visibilitychange`, but resync
  behaviour after a long background on a real device has not been verified.
