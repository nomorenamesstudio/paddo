# Changelog

Reverse chronological. Tagged Feature / Fix / Break.

## 2026-10-25 — Phase 0: probes and ground truth

**Feature** — project scaffold: TypeScript, Vite, Fastify, Yjs/Hocuspocus, Tiptap,
pinned on Node 22. Repository layout under `src/{server,web,mcp}`, prose fixture in
`content/`, docs set under `docs/`.

**Feature** — markdown fidelity settled by measurement, not assumption:
`@tiptap/markdown` runs headless with no DOM; overriding `Italic.renderMarkdown` to
emit `_` makes the round-trip byte-identical on a real prose fixture; files are
written with exactly one trailing newline. Evidence: `spike/probe-markdown.ts`,
`spike/probe-italic.ts`.

**Feature** — anchoring model settled: suggestions live in a `suggestions` Y.Map
inside the room's `Y.Doc`; anchors are Yjs relative positions created against the
`Y.XmlText` holding the quoted characters, which resolves the brief's open question
about relative positions across a restart. Verified across an edit elsewhere in the
document and across an encode/decode cycle: `spike/probe-anchors.ts`.

**Feature** — one-port architecture settled: Fastify owns the socket and invokes
Hocuspocus' upgrade listener, so the app and the CRDT sync share a port and an auth
check. Two clients synced and a wrong token was refused:
`spike/probe-server.ts`.

**Break** — the server deliberately does not apply edits and does not maintain a
ProseMirror position mapping. Accepting a suggestion is a client transaction; the
server only creates anchors from flat text and rewrites the `.md`. This contradicts
the brief's Pattern B description of the server pushing changes into the Yjs doc,
and is recorded in [ARCHITECTURE.md](ARCHITECTURE.md).
