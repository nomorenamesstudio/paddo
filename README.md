# Paddō — A Free, FOSS Markdown Editor for Prose

![License: MIT](https://img.shields.io/badge/license-MIT-blue?style=for-the-badge)
![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=for-the-badge)
![Self-hosted](https://img.shields.io/badge/self--hosted-docker-2496ed?style=for-the-badge&logo=docker&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-installable-5a0fc8?style=for-the-badge)

A free, open-source markdown editor for people who write prose — one calm surface,
real-time sync between your phone and your laptop, and an AI agent that proposes edits
you review inline and never applies on its own.

Name: Paddō — from パッド, "pad", the notepad it is. ASCII: `paddo`.

> [!WARNING]
> **Very early. Version 0.1.0, work in progress.** It signs in, writes, syncs between
> devices and reviews an agent's edits today — it is the editor I write in. It is not
> finished: the API, the data model and the on-disk sidecars will move between minor
> versions without a migration path, there is one password and no accounts, and code blocks
> and footnotes are out of scope. Back up `data/` before you trust it with anything you
> cannot retype.

## Why this exists

A thousand words needs the opposite of a feature list: one column of text, no toolbar
of forty-seven buttons, and no sync problem to think about when you pick up the phone.
The agent part came from the same place — a model that rewrites your paragraph and
hands back a wall of new text is useless, because none of the decisions were yours.

## Features

| | |
| --- | --- |
| **Prose first** | Markdown in a single column, tables included. No code blocks, no plugin sidebar. |
| **No save button** | Yjs over a websocket, both devices in the same document, no conflict dialog. |
| **Reviewable AI edits** | The agent sends hunks, not rewrites. Accept, reject or edit each one, one-handed. |
| **Moving without dragging** | Pick the ⠿ grip, tap where the paragraph goes. Same transaction on every input. |
| **Your files, plainly** | Every document is a `<name>.md` file you can read, grep and edit by hand. |
| **Runs itself** | One container, no database. Settings, tokens and CRDT state live beside it. |

Not a knowledge base, not a team tool, not a note-taking system with a graph view.

## Quick start (Docker)

```bash
git clone https://github.com/nomorenamesstudio/paddo && cd paddo
mkdir -p data/content data/state
cp .env.example .env        # set PADDO_PASSWORD, PADDO_SECRET, PADDO_TOKEN
docker compose up -d --build
```

Open <http://localhost:4319> and sign in. The full walkthrough — reverse proxy,
volumes, backups, upgrades, the ARM and Tailscale shapes — is in
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Quick start (from source)

```bash
pnpm install
cp .env.example .env        # fill in the same three secrets
pnpm build                  # web app into dist/web, server bundle into dist/server
pnpm start                  # http://127.0.0.1:4319
```

`pnpm start` binds `0.0.0.0`, so a phone on the same network can use
`http://<lan-ip>:4319`. No HTTPS means no PWA install — see
[docs/SETUP.md](docs/SETUP.md).

## How it works

One Node process, one port, one socket. The agent is the only thing outside it.

```
phone ──┐                        ┌─ Fastify ─── static PWA, JSON API, cookies, /mcp
        ├── HTTP  ── one port ───┤
desktop ┘                        └─ Hocuspocus ─ Yjs rooms (WebSocket upgrade)

per document room:  Y.Doc ──┬── Y.XmlFragment  "content"      the prose
                            └── Y.Map          "suggestions"  pending hunks

disk:               content/<slug>.md    canonical prose, plain markdown
                    .paddo/<slug>.y      CRDT update log (anchors need it)

agent session ── MCP ── Paddō ── inline suggestions you accept or reject
```

The markdown file is the prose; the CRDT sidecar keeps the identity that a pending
suggestion is anchored to, because a Yjs anchor is an id into CRDT history and dies
with it. Delete the sidecar and pending suggestions are dropped rather than silently
re-attached to text that has moved. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) has
the decisions that are not obvious from the code.

## Working with the agent

Paddō never runs a model. It serves MCP tools — `list_documents`, `read_document`,
`propose_edits`, `create_document`, `export_document`, `submit_markdown`,
`pending_suggestions` — to whatever agent you already use.

1. Open **Settings → Agent tokens**, name the agent, pick its verbs (`read`,
   `propose`, `create`) and its document scope.
2. **Pair an agent**: Paddō prints a short code and a prompt. The agent claims the
   code, you press **Approve**, and the token is collected over the agent's own
   connection — the secret never goes through the chat.
3. Or **Create a token** and paste the block into your client's config:

```json
{ "mcpServers": { "paddo": { "type": "http", "url": "https://your-host/mcp",
  "headers": { "Authorization": "Bearer paddo_…" } } } }
```

The agent quotes your text (`original`, `proposed`, `rationale`); the server locates
the quote, anchors it in the CRDT, and the hunk appears in the editor on every open
device. An ambiguous quote is refused with the match count rather than guessed at. The
agent never touches the file.

A client that cannot do HTTP runs Paddō's stdio server instead —
`PADDO_URL=http://<host>:4319 PADDO_TOKEN=<token> pnpm mcp`. The tool contract is in
[docs/API.md](docs/API.md).

## FAQ

**Is it really free?** Yes. MIT, no account, no hosted tier, no telemetry. You run it.

**Does my writing go to a model provider?** Not through Paddō. Paddō has no API key and
no model client — it answers the agent you pointed at it, and only what that agent asks
for.

**Can I self-host it?** That is the only way to run it: one container, two directories,
no database. [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

**Do I need HTTPS?** For a phone on your LAN, no. For the PWA install and the `Secure`
session cookie, yes — any reverse proxy with a certificate does it, and
`tailscale serve` counts.

**Can two people edit one document?** The sync is real; the accounts are not. One
password, one owner, no per-user identity, so every device edits as the same person.

**What is missing?** Rename and delete exist; search does not. Code blocks and footnotes are
out of scope. Tables are supported and round-trip byte-identically through a save; there is no
row/column UI yet, so a table is edited cell by cell.

**Who built this?** One person, [No More Names Studio](https://nomorenames.studio).

## Tests

```bash
pnpm typecheck
pnpm test        # markdown round-trip, anchoring, diff hunks, tokens, aliases
pnpm test:e2e    # builds the app, starts a server on :4320, drives a browser
```

The e2e suite runs against `tests/fixtures/content` and its own sidecar directory, and
never touches your own documents.

## Layout

```
src/server/       Fastify app, Hocuspocus hooks, anchors, diff, ingest, MCP tools
src/shared/       editor schema, markdown serializer, suggestion record
src/web/          editor UI, suggestion decorations, block moving
src/mcp/          stdio entry for clients that cannot speak HTTP
tools/            server bundle, sidecar compaction, font and wordmark generation
content/          your .md files (docker: data/content)
docs/             INDEX, API, ARCHITECTURE, SETUP, DEPLOYMENT, CHANGELOG
tests/            unit tests and the Playwright suite
```

## Contributing

1. Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and the last few
   [CHANGELOG](docs/CHANGELOG.md) entries — the decisions carry their reasons.
2. Keep it one process, one port, plain files. A PR that adds a database, a second
   service or a model client gets refused on purpose.
3. Run `pnpm typecheck && pnpm test` before opening the PR, and say what you tried by
   hand, not just that it compiles.

## License

MIT — see [LICENSE](LICENSE).

Made with ♥ by [No More Names Studio](https://nomorenames.studio)
