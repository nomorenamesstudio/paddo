# Changelog

Reverse chronological. Tagged Feature / Fix / Break.

## 2026-10-25 — Faster open, and a placeholder while it happens

**Feature** — brotli/gzip on the wire (the editor bundle drops from 923 kB to about
270 kB) and a one-year immutable cache on content-hashed assets, with the shell kept
on `no-cache`.

**Feature** — the editor is a lazy chunk, so the document list paints without waiting
for ProseMirror, and opening a document shows a skeleton — top bar, title, pulsing
text lines — instead of an empty page while the bundle and the document arrive.

**Feature** — peer cursors are labelled by device ("Desktop", "Phone") rather than a
name that means nothing in a single-reader app.

**Fix** — other devices' selections were painted at 44% alpha from an inline style
and read as a mysterious highlighted block; they now use the house tint.

## 2026-10-25 — Working prototype

**Feature** — editor shell on the studio's paper: Source Serif 4 prose, Fraunces
headings, one measure, no toolbar. Italic, bold, headings, blockquote and links with
`⌘K`; no code blocks, no tables, no control panel.

**Feature** — documents are a library, not a single file: `content/*.md` listed at
`/`, each opened at `/d/<slug>` in its own Yjs room.

**Feature** — real-time sync through Hocuspocus sharing the app's single HTTP port.
Edits from one device land in the other's document without a save step.

**Feature** — persistence: the `.md` file stays the canonical prose, a `.paddo/*.y`
sidecar keeps the CRDT history that anchors need. Writes are atomic, normalized to one
trailing newline, and skipped when nothing changed.

**Feature** — auth before exposure: shared password, signed `HttpOnly` cookie,
constant-time comparison, login throttle, bearer token for machine clients, and the
server refuses to boot without its secrets. An unauthenticated WebSocket upgrade is
refused at the socket.

**Feature** — the agent's interface is an MCP server (`pnpm mcp`) with five tools.
Proposals are quote-anchored: the agent copies text, the server resolves it to a Yjs
relative position. Ambiguous quotes are refused.

**Feature** — inline review UI: struck original, thumb-sized chips for small edits,
cards with the full text and rationale for rewrites, and a bottom bar with
`N pending · Reject all · Accept all` on every screen size.

**Feature** — block moving by pick-and-place (⠿ grip, then tap the destination), one
transaction, one undo step, on desktop and touch alike.

**Feature** — file-watch ingest: an agent that edits the `.md` directly still produces
suggestions, and a store never overwrites an external edit it has not seen.

**Fix** — `ySyncPluginKey.getState()` returned undefined because the plugin key
object inside the editor is not the one the app bundle imports; suggestion
decorations never rendered. The plugin is now found by its stable string key.

**Fix** — suggestion buttons are handled by one delegated `pointerdown` listener;
per-button closures died when ProseMirror re-rendered the widget mid-click.

**Fix** — the diff no longer swallows untouched prose into a hunk, and an append at
the end of the document anchors instead of silently producing nothing.

**Fix** — the service worker registers only on a real HTTPS origin. On `localhost` it
served a precached app shell and hid every rebuild.

**Break** — the brief's desktop drag-with-ghost is replaced by pick-and-place for
every input: same single transaction, no HTML5 drag fighting ProseMirror, works with
a finger. Recorded in [ARCHITECTURE.md](ARCHITECTURE.md).

## 2026-10-25 — Phase 0: probes and ground truth

**Feature** — project scaffold: TypeScript, Vite, Fastify, Yjs/Hocuspocus, Tiptap,
pinned on Node 22.

**Feature** — markdown fidelity settled by measurement: `@tiptap/markdown` runs
headless with no DOM; overriding `Italic.renderMarkdown` to emit `_` makes the
round-trip byte-identical; files are written with exactly one trailing newline.

**Feature** — anchoring model settled: suggestions in a `suggestions` Y.Map, anchors
as Yjs relative positions against the `Y.XmlText` holding the quoted characters.
Verified across an edit elsewhere in the document and across an encode/decode cycle.

**Feature** — one-port architecture settled: Fastify owns the socket and invokes
Hocuspocus' upgrade listener.
