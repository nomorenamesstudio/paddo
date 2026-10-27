# Paddō

A self-hosted, PWA Markdown editor for prose, with a local AI agent that joins on
demand and proposes edits you review inline.

Name: Paddō — from パッド, "pad", the notepad it is. ASCII: `paddo`.

## Status

Working prototype. You can sign in, write, sync between devices, and review an
agent's proposals as inline suggestions. See what is not done, below.

## What it does

- Long-form prose editing in Markdown, one calm surface, no toolbar of forty-seven buttons.
- Real-time editing between phone and desktop over Yjs — no save button, no sync layer.
- An agent proposes changes; they land as inline hunks with accept / reject / edit,
  reviewable one-handed on a phone.
- Block moving without dragging: pick the ⠿ grip, then tap where the paragraph goes.
- Documents stay plain `.md` files on your disk.

Not a knowledge base, not a team tool, no tables or code blocks.

## Stack

| Piece | Choice |
| --- | --- |
| Editor | Tiptap 3 (ProseMirror) with the markdown extension |
| Sync | Yjs + Hocuspocus, sharing one HTTP port with the app |
| Server | Fastify 5, one Node 22 process |
| Persistence | `content/*.md` plus a `.paddo/*.y` CRDT sidecar |
| Agent | an external MCP client calling Paddō's own stdio MCP server |
| PWA | Vite + `vite-plugin-pwa` |

## Quick start

```bash
pnpm install
cp .env.example .env        # fill in PADDO_PASSWORD, PADDO_SECRET, PADDO_TOKEN
pnpm build                  # build the web app into dist/web
pnpm start                  # http://127.0.0.1:4319
```

For the phone on the same network, `pnpm start` already binds `0.0.0.0`; open
`http://<lan-ip>:4319` and sign in with the same password. No HTTPS means no PWA
install for now (see [docs/SETUP.md](docs/SETUP.md)).

## Working with the agent

Two ways to work with it:

**A one-time check** — in the editor, open the document menu (⋮) and press
**Invite the agent**. Type what you want changed and copy the prompt.
2. Paste it into your own agent session. It needs Paddō's MCP server:

   ```bash
   PADDO_URL=http://<host>:4319 PADDO_TOKEN=<minted in Settings> pnpm mcp
   ```

The agent reads the document, sends hunks, and they appear inline. Review them on
whichever device is at hand; accepting writes the `.md` file.

**A connected agent** — Settings → *Agent tokens*, name it, pick the verbs (`read`,
`propose edits`, `create documents`) and either every document or a list of them, then
**Pair an agent**. Paddō prints a short code and a prompt; paste the prompt into your
agent's chat. The agent claims the code, Paddō shows it waiting, you press **Approve**,
and the agent collects its token over its own connection — the secret never goes through
the conversation.

If your client takes a config file instead, **Create a token** hands you the block:

```json
{ "mcpServers": { "paddo": { "type": "http", "url": "http://<host>:4319/mcp",
  "headers": { "Authorization": "Bearer paddo_…" } } } }
```

Paddō serves the agent's tools itself, so there is nothing to install next to the
agent and no version to keep in step. From then on any "edit my case study" in that
session can list, read and propose against the documents the token covers — no
invitation sheet. It can also drop a new markdown file in (`create_document`) and take
one out (`export_document`, or **Download markdown** in the document menu).

Paddō never runs a model. It never writes text the agent asked for without your
accept, and the agent never touches the file.

## Tests

```bash
pnpm typecheck
pnpm test        # round-trip, anchoring, diff hunks
pnpm test:e2e    # builds the app, starts a server on :4320, drives a browser
```

## Layout

```
content/          the .md files themselves
src/server/       Fastify app, Hocuspocus hooks, anchors, diff, MCP ingest
src/shared/       editor schema, markdown serializer, suggestion record
src/web/          editor UI, suggestion decorations, block moving
src/server/mcp.ts the agent's MCP tools, served at /mcp and over stdio
spike/            phase 0 probes, kept as evidence
tests/            unit tests and the Playwright suite
docs/             INDEX, API, ARCHITECTURE, SETUP, CHANGELOG
```

## Not done yet

- **PWA install on iOS** needs an HTTPS origin; deferred deliberately, no Tailscale
  or reverse proxy yet. The manifest, icons and service worker are in place.
- **Desktop drag with a ghost** — moving is two-tap/pick-and-place on every input
  instead, which is the same single transaction and works on a phone.
- **Suggestion staleness UI**: if the text under a hunk changes, accept re-finds the
  quote or refuses; there is no "keep mine / take theirs" diff dialog.
- No delete or rename of documents, no search.
- Tables, code blocks and footnotes are out of scope; their round-trip is unverified.

## Built with AI

Paddō is hand-written and AI-enhanced. The specification, the decisions and the
review are mine: the brief, the protocol choices, the refusal to ship a
default-open service. The code is drafted with **DeepSeek V4.1 Flash in DeepSeek
Harness** and reviewed line by line before it lands. The commit history and
[docs/CHANGELOG.md](docs/CHANGELOG.md) show which parts came from where.
