# Setup

## Where agent MCP configs live

Only needed if you go the config-file route; the *Copy prompt* block on the token
screen needs none of this.

| Client | File |
| --- | --- |
| Claude Desktop | `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS), `%APPDATA%\Claude\claude_desktop_config.json` (Windows) |
| Cursor | `~/.cursor/mcp.json`, or `.cursor/mcp.json` in a project |
| VS Code (Copilot) | `.vscode/mcp.json` in the workspace |
| Claude Code | `claude mcp add --transport http paddo <url> --header "Authorization: Bearer …"` |
| DeepSeek Harness | an `@deepseek-ai/dsh-mcp-client` plugin entry in the profile, with `serverName`, `command`, `args`, `env` |

These paths move between releases; treat the table as a starting point, not gospel.
An agent that can run commands does not need any of it — Paddō's API is reachable with
the same bearer token.

## Requirements

- Node 22 (this machine: 22.23.1)
- pnpm 11 (this machine: 11.24.0)

## The pnpm store quirk on this machine

`pnpm` writes its store and state outside the workspace by default, which the file
sandbox denies. Both are redirected into the repo:

- `.npmrc` sets `store-dir=.pnpm-store`
- state and cache dirs need to be pointed at `.cache/` in the environment:

```bash
XDG_DATA_HOME="$PWD/.cache/data" \
XDG_CACHE_HOME="$PWD/.cache" \
XDG_STATE_HOME="$PWD/.cache/state" \
pnpm install
```

Both directories are gitignored. `pnpm-workspace.yaml` allows esbuild's build
script; without it the pnpm warning about ignored builds appears.

Playwright's browser lives in `.cache/ms-playwright` too, for the same reason:
`PLAYWRIGHT_BROWSERS_PATH=.cache/ms-playwright`. The `test:e2e` script sets it.

## Fonts

Self-hosted, one woff2 per face in `public/fonts`, declared in
`src/web/styles/fonts.css`. Both the fonts and the logo are generated:

```bash
python3 tools/fetch-fonts.py     # needs fontTools + brotli
python3 tools/make-wordmark.py   # writes src/web/assets/wordmark.svg
```

`tools/fetch-fonts.py` does **not** use the Google CSS API. That API serves basic Latin
only for these families — 227 glyphs, no macron, no double acute — which is why the `ō`
in Paddō kept falling back to a system serif no matter what the CSS said. The script
takes the full font from the google/fonts repo, subsets it to the Latin ranges prose
needs, and writes one woff2 per face with no `unicode-range`: the file really does cover
what it claims. The wordmark is outlines now, so the logo does not depend on the webfont
at all.

## Configuration

Copy `.env.example` to `.env`. The server refuses to start unless the three secrets
are set — a default-open service reachable from a phone is not acceptable.

| Variable | Meaning |
| --- | --- |
| `PADDO_PASSWORD` | the single login password |
| `PADDO_SECRET` | HMAC key for signing the session cookie (`openssl rand -hex 32`) |
| `PADDO_TOKEN` | bearer token the MCP server presents to the HTTP API |
| `PADDO_CONTENT_DIR` | where the `.md` files live, default `content` |
| `PADDO_SIDECAR_DIR` | where the CRDT sidecars live, default `.paddo` |
| `PADDO_HOST` | `0.0.0.0` when the phone needs to reach it over the LAN |
| `PADDO_PORT` | default `4319` — `3100`, the usual dev port on this machine, is taken |

`.env` is gitignored; `.env.example` carries placeholders only.

## Running

```bash
pnpm build        # web app into dist/web (the server serves it)
pnpm start        # one process, one port
pnpm dev          # server with tsx watch
pnpm dev:web      # rebuild dist/web on change, in a second terminal
```

`pnpm start` binds `0.0.0.0:4319`, so the phone can use `http://<lan-ip>:4319`.

A rebuild of the web app does not need a server restart: static files are served by
path, not by a route table built at boot.

## Development over plain HTTP

Early development runs over the LAN without TLS. Two consequences:

- the session cookie is only marked `Secure` when the request origin is HTTPS, so
  Safari stores it over `http://`;
- the service worker is not registered outside a secure origin, and deliberately not
  on `localhost` or `10.*` either: a precached app shell would hide rebuilds. A real
  HTTPS origin gets the PWA.

## Resetting a document's CRDT state

Deleting `.paddo/<slug>.y` while a browser still has the document open creates a
second CRDT lineage from the same markdown. When that tab reconnects, Yjs merges the
two by concatenation and you get the whole document twice. So:

1. stop the server,
2. close every Paddō tab (desktop and phone),
3. edit or restore the `.md`,
4. delete the sidecar,
5. start the server.

## Tests

```bash
pnpm typecheck
pnpm test
pnpm test:e2e
```

`test:e2e` builds the app, starts its own server on port 4320 with
`PADDO_CONTENT_DIR=tests/fixtures/content` and `PADDO_SIDECAR_DIR=.paddo-test`, and
creates a fresh document per test. It never touches `content/` or a running instance.

## Not yet decided

Deployment: a systemd unit plus either `tailscale serve` or a reverse proxy. It is
deliberately out of scope until the app is worth installing.
