# Setup

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
script; without it the pnpm warning about ignored builds appears and Vite has no
binary.

## Configuration

Copy `.env.example` to `.env`. The server refuses to start unless the three secrets
are set — a default-open service reachable from a phone is not acceptable.

| Variable | Meaning |
| --- | --- |
| `PADDO_PASSWORD` | the single login password |
| `PADDO_SECRET` | HMAC key for signing the session cookie (`openssl rand -hex 32`) |
| `PADDO_TOKEN` | bearer token the MCP server presents to the HTTP API |
| `PADDO_CONTENT_DIR` | where the `.md` files live, default `content` |
| `PADDO_HOST` | `0.0.0.0` when the phone needs to reach it over the LAN |
| `PADDO_PORT` | default `4319` — `3100`, the usual dev port on this machine, is already taken |

`.env` is gitignored; `.env.example` carries placeholders only.

## Running

```bash
pnpm dev          # server, tsx watch
pnpm dev:web      # vite dev server for the UI
pnpm typecheck
```

`pnpm dev` binds `0.0.0.0:4319`, so the phone can use
`http://<lan-ip>:4319` during development.

## Development over plain HTTP

Early development runs over the LAN without TLS. Two consequences:

- the session cookie is only marked `Secure` when the request origin is HTTPS, so
  Safari will store it over `http://`;
- the service worker is not registered outside a secure context, so PWA install is
  deferred until the service has an HTTPS origin (Tailscale `serve`, or a subdomain
  behind a reverse proxy). `localhost` counts as secure, so desktop install testing
  works today.

## Not yet decided

Deployment: a systemd unit plus either `tailscale serve` or a reverse proxy. It is
deliberately out of scope until the app is worth installing.
