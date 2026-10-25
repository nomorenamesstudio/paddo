# Paddō

A self-hosted, PWA Markdown editor for prose, with a local AI agent that joins on
demand and proposes edits you review inline.

Name: Paddō — from パッド, "pad", the notepad it is. ASCII: `paddo`.

## Status

Phase 0 complete: the risky assumptions are verified, nothing is wired up yet.
See [docs/CHANGELOG.md](docs/CHANGELOG.md) and
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## What it is

- Long-form prose drafting in Markdown, one document at a time, calm surface.
- Real-time editing between phone and desktop over Yjs — no save button, no sync layer.
- A local agent proposes edits; they arrive as inline suggestions you accept or reject
  on whichever device is in your hand.
- Documents stay plain `.md` files on your disk.

Not a knowledge base, not a team tool, no tables or code blocks.

## Stack

| Piece | Choice |
| --- | --- |
| Editor | Tiptap 3 (ProseMirror) with the markdown extension |
| Sync | Yjs + Hocuspocus, sharing one HTTP port with the app |
| Server | Fastify 5, one Node 22 process |
| Persistence | `content/*.md` plus a `.paddo/*.y` CRDT sidecar |
| Agent | an external MCP client calling Paddō's own MCP server |
| PWA | Vite + `vite-plugin-pwa` |

## Quick start

```bash
pnpm install
cp .env.example .env        # fill in PADDO_PASSWORD, PADDO_SECRET, PADDO_TOKEN
pnpm dev                    # http://127.0.0.1:4319
```

Full setup, including the pnpm store quirk on this machine, is in
[docs/SETUP.md](docs/SETUP.md).

## Layout

```
content/          the .md files themselves
src/server/       Fastify app, Hocuspocus, persistence, MCP ingest   (phase 1+)
src/web/          editor UI                                            (phase 1+)
src/mcp/          stdio MCP server agents connect to                   (phase 4)
spike/            phase 0 throwaway probes, kept as evidence
docs/             INDEX, API, ARCHITECTURE, SETUP, CHANGELOG
```

## Built with AI

Paddō is hand-written and AI-enhanced. The specification, the decisions and the
review are mine: the brief, the protocol choices, the refusal to ship a
default-open service. The code is drafted with **DeepSeek V4.1 Flash in DeepSeek
Harness** and reviewed line by line before it lands. The commit history and
[docs/CHANGELOG.md](docs/CHANGELOG.md) show which parts came from where.
