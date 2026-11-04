# Deployment

Paddō is one container: a single Node process that serves the PWA, the JSON API, the
MCP endpoint and the Yjs websocket on one port. No database, no queue, no external
service, nothing to migrate.

- **Port:** `4319`
- **Image:** built from this repo — `paddo:<version>`
- **Volumes:** two directories, one for your prose and one for the state
- **Health:** `GET /healthz`, unauthenticated, wired into the compose healthcheck

## 1. What you need

- Docker with the Compose plugin.
- A host you own — a homelab box, a Pi, a VPS. ARM64 works: the image builds on
  amd64 and arm64 with no changes.
- Optional but recommended: a reverse proxy with a certificate. Paddō installs as a
  PWA only over HTTPS, and the session cookie is only `Secure` there.

## 2. First run

```bash
git clone https://github.com/nomorenamesstudio/paddo && cd paddo
mkdir -p data/content data/state
cp .env.example .env
```

Fill in the three secrets in `.env`:

```bash
openssl rand -hex 32   # PADDO_SECRET — signs the session cookie
openssl rand -hex 32   # PADDO_TOKEN  — the machine key, for stdio MCP clients
                       # PADDO_PASSWORD — what you type at the login screen
```

Then:

```bash
docker compose up -d --build
docker compose logs -f paddo
```

Open <http://localhost:4319> and sign in with `PADDO_PASSWORD`.

The server refuses to start without those three values, and refuses a `PADDO_SECRET`
or `PADDO_TOKEN` shorter than 32 characters. That is deliberate: a default-open
markdown editor on your LAN is not something to discover later.

## 3. The two volumes

| Container path | Host path | What is in it |
| --- | --- | --- |
| `/data/content` | `./data/content` | your documents, plain `<slug>.md` |
| `/data/state` | `./data/state` | `<slug>.y` CRDT sidecars, `<slug>.meta.json` status, `aliases.json`, `tokens.json`, `settings.json` |

`/data/content` is the prose. Read it, grep it, edit it by hand, back it up with
anything that copies files.

`/data/state` is everything the app knows that a markdown file cannot hold: the CRDT
identity that pending suggestions are anchored to, the minted agent tokens, the
writing guide, the theme, renamed-document aliases. **Losing it loses every pending
suggestion and every minted token** — the prose survives, the review state does not.
Back up both.

A backup that is consistent: `docker compose stop paddo`, copy `data/`, start it
again. Copying while a room is open is fine for the prose and racy for the sidecars.

### Ownership

The container runs as the host user, not root, so the files in `data/` stay yours:

```yaml
user: "${PUID:-1000}:${PGID:-1000}"
```

That means `data/content` and `data/state` must exist **and be writable by that uid
before the first start** — docker creates a missing bind-mount target as root, and
the app then cannot write. If your user is not 1000, put `PUID` and `PGID` in `.env`.
Fixing an already-wrong directory is one `chown`; run it yourself, with the paths in
front of you:

```bash
sudo chown -R 1000:1000 data
```

## 4. Behind a reverse proxy

The one thing to get right: `X-Forwarded-For`. The login throttle keys on the client
address, and behind a proxy that address is the proxy — five wrong passwords from
anywhere would then lock out every device. Compose sets `PADDO_TRUST_PROXY=true` for
this reason. It is `false` by default in `.env.example`, because an instance reachable
directly must not believe a caller-supplied header.

The session cookie's `Secure` flag is decided per request from the request origin or
`X-Forwarded-Proto: https`, so nothing else needs configuring.

### Caddy, same host

```caddyfile
paddo.example.com {
	reverse_proxy 127.0.0.1:4319
}
```

Caddy upgrades websockets on its own — the Yjs connection needs no separate rule.

Once the proxy is in front, stop publishing the port to the world:

```yaml
ports:
  - "127.0.0.1:4319:4319"
```

Or drop `ports` entirely and attach this service to Caddy's docker network, then
`reverse_proxy paddo:4319`.

### Caddy or nginx as a container

Point the proxy at the service name (`paddo:4319`) on a shared network. A container
cannot reach another container's published host port through `localhost`.

### Tailscale instead

```bash
tailscale serve --bg https / http://127.0.0.1:4319
```

`tailscale serve` sets `X-Forwarded-For` and terminates TLS with a real certificate,
so the PWA installs and the cookie is `Secure`. Bind the published port to
`127.0.0.1` in that shape too.

## 5. Versioning and upgrades

The version lives in `package.json` and is stamped into the image tag by compose:

```bash
PADDO_VERSION=0.1.0 docker compose up -d --build
```

`PADDO_VERSION` is optional; without it the image is tagged `paddo:local`.

`/healthz` answers with state, not identity — it deliberately does not report a
version, so a public probe cannot tell anyone which build to look up advisories for.
To check what is running: `docker compose images`, the release notes in
[CHANGELOG.md](CHANGELOG.md), or `package.json` in the checkout.

Upgrade:

```bash
git pull
docker compose up -d --build
```

State lives in the volumes, not the image, so a rebuild is not a migration. Restarting
closes every open room; the CRDT state is already in the sidecars, so an open tab
reconnects and picks it up.

## 6. Operating it

```bash
docker compose ps                      # healthy or not
docker compose logs -f paddo           # the server logs JSON, warn level in production
docker compose restart paddo           # after an .env change
curl -fsS localhost:4319/healthz       # {"ok":true,"app":"paddo"}
```

An `.env` change needs a restart; nothing reads the file after boot.

### Things that will bite on a homelab

- **The file watcher needs local disk.** An agent or an editor that edits
  `data/content/*.md` directly is turned into reviewable suggestions by inotify.
  NFS, SMB and some overlay filesystems do not deliver inotify events from the host,
  so that trick silently stops working while everything else looks fine.
- **Hard links.** Renaming a document moves its sidecar, status file and markdown
  with `link`+`unlink` so a rename can never overwrite an existing document. A
  filesystem without hard links falls back to `rename` and is still safe, just with a
  narrower race window than the design intends.
- **One user.** One password, one session cookie (30 days), no accounts, no 2FA. It
  is a personal editor: put it behind TLS, do not publish the port, and treat anyone
  who can reach the login screen as someone who may guess.
- **HTTPS is what makes it installable.** Over plain `http://<lan-ip>:4319` the app
  works and the service worker deliberately does not register, so there is no offline
  shell and no home-screen install.

## 7. Giving an agent access

Two paths, both from **Settings → Agent tokens**:

- **Pair an agent** — a short code, approval on your side, the token collected over
  the agent's own connection. Nothing secret goes through the chat.
- **Create a token** — copy the prompt or the config block for your client.

The token is minted with verbs (`read`, `propose`, `create`) and a document scope,
and it reaches the API at `https://<your-host>/mcp`. Paddō serves the agent's tools
itself; there is nothing to install next to the agent.

`PADDO_TOKEN` from `.env` is a different thing: the machine's own key, every verb,
every document, and what a stdio client (`pnpm mcp`) or a websocket client uses.
