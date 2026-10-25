# Architecture

## Shape

One Node 22 process, one port, one socket.

```
phone ──┐                        ┌─ Fastify ─── static PWA, JSON API, cookies
        ├── HTTPS ── one port ───┤
desktop ┘                        └─ Hocuspocus ─ Yjs rooms (WebSocket upgrade)

                Fastify owns the socket; Hocuspocus' upgrade listener is invoked
                from it, so both share the port and the same auth check.

per document room:  Y.Doc ──┬── Y.XmlFragment  "content"   the prose
                            └── Y.Map          "suggestions"  pending hunks

disk:               content/<slug>.md        canonical prose, plain markdown
                    .paddo/<slug>.y          Yjs update log (anchors need it)
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
copy a substring verbatim. So a hunk arrives as
`{ original, proposed, rationale }`, the server locates `original` in the live
document, converts that to a Yjs relative position, and stores the anchor. An
ambiguous match is refused with the list of matches, so the agent retries with more
context rather than the server guessing.

**The server never applies edits.** Accepting a suggestion is a ProseMirror
transaction on the client that originated it; Yjs carries it to every other device
and the server only observes the change to rewrite the `.md`. That is why the
server can do its whole job without a DOM, a ProseMirror view, or a position
mapping: it creates anchors from flat text, and the client converts them to
document positions with the real binding.

**Two writers, one authority.** The server watches `content/` for changes so an
agent that just edits the file still produces suggestions, but the server is the
only thing that writes the file from the editor. It records the hash of what it
wrote; a file-watch event carrying that hash is its own echo and is ignored.

## Verified in phase 0

Each line below was measured with a script in [`../spike/`](../spike), on the exact
dependency versions pinned in `pnpm-lock.yaml`. Not carried over from documentation.

| Claim | Evidence |
| --- | --- |
| Tiptap's markdown manager runs headless in Node with no DOM | `spike/probe-markdown.ts` parses and serializes the fixture |
| `_italics_` round-trips byte-identically | `spike/probe-italic.ts`: overriding `Italic.renderMarkdown` to emit `_`, then `serialize(parse(x)) + "\n" === x`; second pass idempotent |
| Em dashes and links survive untouched | same probe: only the italic delimiter differed before the override |
| Anchors survive an edit elsewhere in the document | `spike/probe-anchors.ts` inserts text before the anchor, quote still resolves |
| Anchors survive a restart | same probe: `encodeStateAsUpdate` → fresh doc → same quote resolves |
| Y state converts back to a ProseMirror node headless | same probe, `yXmlFragmentToProseMirrorRootNode` |
| Fastify and Hocuspocus can share one port | `spike/probe-server.ts`: HTTP route and two synced clients on the same socket |
| `onAuthenticate` actually refuses a bad token | same probe: wrong token → `permission-denied` |

Consequences carried into the build:

- The italic extension is a local `Italic.extend`, not `@tiptap/starter-kit`'s.
- Markdown is written with exactly one trailing newline, and the serializer output
  is normalized to that, or every save looks like a change to the watcher.
- Anchors are created against the `Y.XmlText` holding the quoted characters — the
  same kind y-prosemirror builds internally, so a client resolves them with its own
  binding mapping.

## Known limits

- The server cannot resolve a Yjs anchor to a ProseMirror position, and does not
  need to. Anything that does (decorations, accept) is client work.
- If two devices accept overlapping hunks at the same instant, last writer wins on
  the text; the losing hunk is re-checked on the next render and marked stale
  instead of being applied twice.
- Markdown fidelity is verified against prose. Tables and code blocks are out of
  scope for v1 and their round-trip is not covered.
