import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'

import chokidar from 'chokidar'

import compress from '@fastify/compress'
import cookie from '@fastify/cookie'
import fastifyStatic from '@fastify/static'
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify'

import { SUGGESTIONS_MAP, type Suggestion } from '../shared/suggestions'
import { constantTimeEquals, createSession, LoginThrottle, readCookie, SESSION_COOKIE, SESSION_TTL_MS, verifySession } from './auth'
import { resolveAlias } from './aliases'
import { createCollab, markdownFromYDoc } from './collab'
import { loadConfig, type Config } from './config'
import {
  createDocument,
  createDocumentWithMarkdown,
  createDraft,
  deleteSidecar,
  hashOf,
  isValidSlug,
  pathFor,
  listDocuments,
  normalizeMarkdown,
  readDocument,
  removeDocument,
  sidecarPathFor,
  titleOf,
} from './documents'
import { proposeEdits, proposeMarkdown, type ProposeEdit } from './ingest'
import { createAgentServer } from './mcp'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { isStatus, readAllStatuses, readStatus, removeStatus, writeStatus } from './meta'
import { countPendingFor } from './pending'
import { approvePairing, claimPairing, denyPairing, listPairings, startPairing } from './pairing'
import { normalizeSettings, readSettings, writeSettings } from './settings'
import {
  allows,
  grantDocument,
  listTokens,
  mintToken,
  normalizeMint,
  revokeToken,
  verifyToken,
  type AgentToken,
  type Verb,
} from './tokens'

try {
  process.loadEnvFile('.env')
} catch {
  // No .env file: the config loader decides whether that is fatal.
}

const config = loadConfig()
const collab = createCollab(config)
const throttle = new LoginThrottle()

const app = Fastify({ logger: { level: process.env.NODE_ENV === 'production' ? 'warn' : 'info' } })

await app.register(cookie)

// Nearly a megabyte of editor code on every cold load; brotli takes it to ~270 kB.
await app.register(compress, { global: true, encodings: ['br', 'gzip'] })

function sessionCookieOptions(request: FastifyRequest) {
  const secure = request.protocol === 'https' || request.headers['x-forwarded-proto'] === 'https'
  return {
    path: '/',
    httpOnly: true,
    sameSite: 'lax' as const,
    secure,
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  }
}

function hasSession(request: FastifyRequest): boolean {
  return verifySession(config.secret, readCookie(request.headers.cookie, SESSION_COOKIE))
}

function bearer(request: FastifyRequest): string | undefined {
  const header = request.headers.authorization
  return header?.startsWith('Bearer ') ? header.slice(7) : undefined
}

/** `PADDO_TOKEN` is the machine's own key: every verb, every document. */
const ENV_TOKEN: AgentToken = {
  id: 'env',
  name: 'environment token',
  hash: '',
  verbs: ['read', 'propose', 'create'],
  documents: '*',
  createdAt: 0,
}

type Principal = { kind: 'session' } | { kind: 'agent'; token: AgentToken }

async function principalOf(request: FastifyRequest): Promise<Principal | null> {
  if (hasSession(request)) return { kind: 'session' }
  const secret = bearer(request)
  if (!secret) return null
  if (constantTimeEquals(secret, config.token)) return { kind: 'agent', token: ENV_TOKEN }
  const token = await verifyToken(config, secret)
  return token ? { kind: 'agent', token } : null
}

function isAuthorised(request: FastifyRequest): boolean {
  if (hasSession(request)) return true
  const secret = bearer(request)
  return Boolean(secret && constantTimeEquals(secret, config.token))
}

/** The browser UI (settings, status, delete, tokens) is the owner's alone. */
function requireSession(request: FastifyRequest, reply: FastifyReply, done: () => void) {
  if (!hasSession(request)) {
    reply.code(401).send({ error: 'unauthorised' })
    return
  }
  done()
}

/**
 * An agent route: a session passes freely, a token needs the verb and, when the
 * route names a document, that document in its scope.
 */
function guard(verb: Verb | 'any') {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const principal = await principalOf(request)
    if (!principal) return reply.code(401).send({ error: 'unauthorised' })
    if (principal.kind === 'session') return
    const { token } = principal
    if (verb !== 'any' && !token.verbs.includes(verb)) {
      return reply.code(403).send({ error: `this token cannot ${verb}` })
    }
    const slug = (request.params as { slug?: string } | undefined)?.slug
    if (slug && !allows(token, verb === 'any' ? 'read' : verb, slug)) {
      return reply.code(403).send({ error: `this token has no access to ${slug}` })
    }
  }
}

function clientKey(request: FastifyRequest): string {
  return request.ip || 'unknown'
}

// Content-hashed bundles never change under the same name; everything else (the
// shell, the manifest, the service worker) has to be revalidated on every load.
app.addHook('onSend', async (request, reply) => {
  if (request.url.startsWith('/api/') || request.url.startsWith('/ws')) return
  reply.header(
    'cache-control',
    request.url.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
  )
})

// --- health, deliberately unauthenticated, no document data ------------------

app.get('/healthz', async () => ({ ok: true, app: 'paddo' }))

// --- session ----------------------------------------------------------------

app.get('/api/session', async (request) => ({ authenticated: isAuthorised(request) }))

app.post('/api/login', async (request, reply) => {
  const key = clientKey(request)
  if (!throttle.allow(key)) {
    reply.code(429).send({ error: 'too many attempts, wait a minute' })
    return
  }

  const body = request.body as { password?: unknown } | undefined
  const password = typeof body?.password === 'string' ? body.password : ''
  if (!constantTimeEquals(password, config.password)) {
    reply.code(401).send({ error: 'wrong password' })
    return
  }

  throttle.reset(key)
  reply.setCookie(SESSION_COOKIE, createSession(config.secret), sessionCookieOptions(request))
  return { authenticated: true }
})

app.post('/api/logout', async (request, reply) => {
  reply.clearCookie(SESSION_COOKIE, { path: '/' })
  return { authenticated: false }
})

// --- documents --------------------------------------------------------------

app.get('/api/documents', { preHandler: guard('read') }, async (request) => {
  const principal = await principalOf(request)
  const visible = (slug: string) =>
    principal?.kind !== 'agent' || principal.token.documents === '*' || principal.token.documents.includes(slug)

  const documents = (await listDocuments(config)).filter((document) => visible(document.slug))
  const slugs = documents.map((document) => document.slug)
  const [statuses, pending] = await Promise.all([
    readAllStatuses(config, slugs),
    countPendingFor(config, slugs),
  ])
  return {
    documents: documents.map((document) => ({
      ...document,
      status: statuses.get(document.slug) ?? 'draft',
      pending: pending.get(document.slug) ?? 0,
    })),
  }
})

app.post('/api/documents', { preHandler: guard('create') }, async (request, reply) => {
  const body = request.body as { name?: unknown; markdown?: unknown } | undefined
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const markdown = typeof body?.markdown === 'string' ? body.markdown : undefined

  try {
    // No name: an untitled draft, named by whatever heading the writer types.
    const created = markdown
      ? await createDocumentWithMarkdown(config, name, markdown)
      : name
        ? await createDocument(config, name)
        : await createDraft(config)

    const principal = await principalOf(request)
    if (principal?.kind === 'agent') {
      // Dropped in by an agent: it goes on the token's list, so the file is not
      // born outside the scope the agent can read back.
      await grantDocument(config, principal.token.id, created.slug)
    }
    return created
  } catch (error) {
    reply.code(409).send({ error: (error as Error).message })
    return
  }
})

// The exact file, for a download or for an agent taking the text away with it.
app.get('/api/documents/:slug/raw', { preHandler: guard('read') }, async (request, reply) => {
  const { slug } = request.params as { slug: string }
  if (!isValidSlug(slug)) {
    reply.code(400).send({ error: 'invalid document name' })
    return
  }

  // The live room is ahead of the file by the store debounce; a download should be
  // what the writer sees, not what the last save left behind.
  let markdown: string | null = null
  try {
    const connection = await openDocument(slug)
    try {
      if (connection.document) markdown = markdownFromYDoc(connection.document)
    } finally {
      await connection.disconnect()
    }
  } catch {
    // No room: fall through to the file.
  }

  if (markdown === null) {
    try {
      markdown = await readDocument(config, slug)
    } catch {
      reply.code(404).send({ error: 'no such document' })
      return
    }
  }

  reply.header('content-type', 'text/markdown; charset=utf-8')
  reply.header('content-disposition', `attachment; filename="${slug}.md"`)
  return markdown
})

app.get('/api/documents/:slug', { preHandler: guard('read') }, async (request, reply) => {
  const { slug } = request.params as { slug: string }
  if (!isValidSlug(slug)) {
    reply.code(400).send({ error: 'invalid document name' })
    return
  }
  try {
    const markdown = await readDocument(config, slug)
    return {
      slug,
      title: titleOf(markdown, slug),
      markdown,
      status: await readStatus(config, slug),
    }
  } catch {
    // Renamed since this address was handed out: answer with the name it has now.
    const current = await resolveAlias(config, slug)
    if (current !== slug) {
      try {
        const markdown = await readDocument(config, current)
        return {
          slug: current,
          moved: true,
          title: titleOf(markdown, current),
          markdown,
          status: await readStatus(config, current),
        }
      } catch {
        // The alias points at something that is gone as well: fall through.
      }
    }
    reply.code(404).send({ error: 'no such document' })
    return
  }
})

app.get('/api/settings', { preHandler: requireSession }, async () => readSettings(config))

// The writing guide alone, for an agent that has to follow it: no theme, no token
// management, nothing an agent could change.
app.get('/api/settings/guide', { preHandler: guard('read') }, async () => {
  const settings = await readSettings(config)
  return { writingGuide: settings.writingGuide }
})

app.put('/api/settings', { preHandler: requireSession }, async (request, reply) => {
  let settings
  try {
    settings = normalizeSettings(request.body)
  } catch (problem) {
    reply.code(400).send({ error: problem instanceof Error ? problem.message : 'invalid settings' })
    return
  }
  await writeSettings(config, settings)
  return settings
})

app.delete('/api/documents/:slug', { preHandler: requireSession }, async (request, reply) => {
  const { slug } = request.params as { slug: string }
  if (!isValidSlug(slug)) {
    reply.code(400).send({ error: 'invalid document name' })
    return
  }

  try {
    await readDocument(config, slug)
  } catch {
    reply.code(404).send({ error: 'no such document' })
    return
  }

  // Drop the live room first: a store from a connected editor would otherwise
  // write the markdown straight back after the unlink.
  collab.server.hocuspocus.closeConnections(slug)
  await removeDocument(config, slug)
  await deleteSidecar(config, slug)
  await removeStatus(config, slug)
  return { slug, deleted: true }
})

app.patch('/api/documents/:slug', { preHandler: requireSession }, async (request, reply) => {
  const { slug } = request.params as { slug: string }
  if (!isValidSlug(slug)) {
    reply.code(400).send({ error: 'invalid document name' })
    return
  }

  const body = request.body as { status?: unknown } | undefined
  if (!isStatus(body?.status)) {
    reply.code(400).send({ error: 'status must be draft, editing, published or archived' })
    return
  }

  try {
    await readDocument(config, slug)
  } catch {
    reply.code(404).send({ error: 'no such document' })
    return
  }

  await writeStatus(config, slug, body.status)
  return { slug, status: body.status }
})

// --- suggestions ------------------------------------------------------------

async function openDocument(slug: string) {
  return collab.server.hocuspocus.openDirectConnection(slug, {})
}

/** The slug a request should act on: the document's current name, or null if gone. */
async function liveSlug(slug: string): Promise<string | null> {
  if (!isValidSlug(slug)) return null
  if (existsSync(pathFor(config, slug)) || existsSync(sidecarPathFor(config, slug))) return slug
  const current = await resolveAlias(config, slug)
  if (current === slug) return null
  return existsSync(pathFor(config, current)) || existsSync(sidecarPathFor(config, current))
    ? current
    : null
}

app.get('/api/documents/:slug/suggestions', { preHandler: guard('read') }, async (request, reply) => {
  const { slug } = request.params as { slug: string }
  if (!isValidSlug(slug)) {
    reply.code(400).send({ error: 'invalid document name' })
    return
  }
  if (!(await liveSlug(slug))) {
    reply.code(404).send({ error: 'no such document' })
    return
  }

  const connection = await openDocument(slug)
  const document = connection.document
  if (!document) {
    reply.code(404).send({ error: 'no such document' })
    await connection.disconnect()
    return
  }
  try {
    const map = document.getMap<Record<string, unknown>>(SUGGESTIONS_MAP)
    const suggestions = [...map.values()].filter(
      (value) => (value as unknown as Suggestion).status === 'pending',
    )
    return { suggestions }
  } finally {
    await connection.disconnect()
  }
})

app.post('/api/documents/:slug/suggestions', { preHandler: guard('propose') }, async (request, reply) => {
  const { slug } = request.params as { slug: string }
  if (!isValidSlug(slug)) {
    reply.code(400).send({ error: 'invalid document name' })
    return
  }
  if (!(await liveSlug(slug))) {
    reply.code(404).send({ error: 'no such document' })
    return
  }

  const body = request.body as
    | { edits?: ProposeEdit[]; markdown?: string; author?: 'agent' | 'file' }
    | undefined

  const author = body?.author === 'file' ? 'file' : 'agent'
  const connection = await openDocument(slug)
  try {
    if (typeof body?.markdown === 'string') {
      return await proposeMarkdown(connection, body.markdown, author)
    }
    if (Array.isArray(body?.edits) && body.edits.length > 0) {
      return await proposeEdits(connection, body.edits, author)
    }
    reply.code(400).send({ error: 'send either `edits` or `markdown`' })
    return
  } finally {
    await connection.disconnect()
  }
})

app.patch(
  '/api/documents/:slug/suggestions/:id',
  { preHandler: requireSession },
  async (request, reply) => {
    const { slug, id } = request.params as { slug: string; id: string }
    const body = request.body as { status?: unknown } | undefined
    const status = body?.status

    if (status !== 'rejected' && status !== 'accepted') {
      reply.code(400).send({ error: 'status must be accepted or rejected' })
      return
    }

    // Accepting happens in the editor (it owns the text transaction). This route
    // drops or marks the record for the writer's own UI calls — and only for them,
    // because rejecting everything in a document is the human's lever, not the
    // agent's.
    const connection = await openDocument(slug)
    const document = connection.document
    if (!document) {
      reply.code(404).send({ error: 'no such document' })
      await connection.disconnect()
      return
    }
    try {
      const map = document.getMap<Record<string, unknown>>(SUGGESTIONS_MAP)
      if (!map.has(id)) {
        reply.code(404).send({ error: 'no such suggestion' })
        return
      }
      if (status === 'rejected') map.delete(id)
      else map.set(id, { ...(map.get(id) as unknown as Suggestion), status: 'accepted' })
      return { ok: true }
    } finally {
      await connection.disconnect()
    }
  },
)

// --- pairing: a token that never travels through a chat log -------------------
//
// The writer starts a pairing and reads out a short code; the agent claims it; the
// writer approves; the agent collects the token over its own connection. The code is
// the only thing that reaches the conversation, and it is dead once used.

app.get('/api/pair', { preHandler: requireSession }, async () => ({ pairings: listPairings() }))

app.post('/api/pair', { preHandler: requireSession }, async (request, reply) => {
  let input
  try {
    input = normalizeMint(request.body)
  } catch (problem) {
    reply.code(400).send({ error: problem instanceof Error ? problem.message : 'invalid pairing' })
    return
  }
  return startPairing(input)
})

app.post('/api/pair/claim', async (request, reply) => {
  const key = `pair:${clientKey(request)}`
  if (!throttle.allow(key)) {
    reply.code(429).send({ error: 'too many attempts, wait a minute' })
    return
  }

  const body = request.body as { code?: unknown } | undefined
  const code = typeof body?.code === 'string' ? body.code : ''
  if (!code) {
    reply.code(400).send({ error: 'send the code from Paddō' })
    return
  }

  const claimed = await claimPairing(config, code)
  if (claimed.state === 'unknown') {
    // Nothing to leak: an unknown code and an expired one look the same.
    reply.code(404).send({ error: 'that code is unknown or has expired' })
    return
  }
  if (claimed.state === 'approved') {
    throttle.reset(key)
    return { state: 'approved', token: claimed.secret }
  }
  // Still waiting on the writer: the agent polls, it does not retry blindly.
  reply.code(202)
  return { state: claimed.state }
})

app.post('/api/pair/:code/approve', { preHandler: requireSession }, async (request, reply) => {
  const { code } = request.params as { code: string }
  const result = approvePairing(code)
  if (!result.approved) {
    reply.code(404).send({ error: result.reason })
    return
  }
  return { code, approved: true }
})

app.post('/api/pair/:code/deny', { preHandler: requireSession }, async (request, reply) => {
  const { code } = request.params as { code: string }
  if (!denyPairing(code)) {
    reply.code(404).send({ error: 'no such pairing' })
    return
  }
  return { code, denied: true }
})

// --- MCP over HTTP ----------------------------------------------------------
//
// The agent's tools, served by this process: a client needs a URL and a bearer
// token, not a Node script on the agent's machine. Stateless — every request builds
// a server bound to the caller's own token, so scoping is the same check the API
// makes.

app.post('/mcp', async (request, reply) => {
  const secret = bearer(request)
  const principal = secret ? await principalOf(request) : null
  if (!secret || principal?.kind !== 'agent') {
    reply.code(401).send({ error: 'unauthorised' })
    return
  }

  const origin = `${request.protocol}://${request.host}`
  const server = createAgentServer({ baseUrl: origin, token: secret })
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })

  reply.hijack()
  await server.connect(transport)
  try {
    await transport.handleRequest(request.raw, reply.raw, request.body)
  } finally {
    await server.close()
  }
})

// No server-initiated messages and no sessions, so the streaming and delete verbs
// have nothing to do; saying so beats a 404 that looks like a wrong URL.
app.get('/mcp', async (_request, reply) => {
  reply.code(405).send({ error: 'paddo is stateless: POST to /mcp' })
})

app.delete('/mcp', async (_request, reply) => {
  reply.code(405).send({ error: 'paddo is stateless: POST to /mcp' })
})

// --- agent tokens -----------------------------------------------------------

app.get('/api/tokens', { preHandler: requireSession }, async () => ({ tokens: await listTokens(config) }))

app.post('/api/tokens', { preHandler: requireSession }, async (request, reply) => {
  let input
  try {
    input = normalizeMint(request.body)
  } catch (problem) {
    reply.code(400).send({ error: problem instanceof Error ? problem.message : 'invalid token' })
    return
  }
  const minted = await mintToken(config, input)
  // The secret exists in this response and nowhere else.
  return minted
})

app.delete('/api/tokens/:id', { preHandler: requireSession }, async (request, reply) => {
  const { id } = request.params as { id: string }
  const revoked = await revokeToken(config, id)
  if (!revoked) {
    reply.code(404).send({ error: 'no such token' })
    return
  }
  return { id, revoked: true }
})

// --- file watch: an agent that just edits the .md still proposes -------------

const watcher = chokidar.watch(config.contentDir, {
  ignoreInitial: true,
  depth: 0,
  awaitWriteFinish: { stabilityThreshold: 250, pollInterval: 60 },
})

watcher.on('ready', () => app.log.info(`watching ${config.contentDir} for edits`))

watcher.on('all', (event, path) => {
  if (event !== 'add' && event !== 'change') return
  const slug = basename(path, '.md')
  if (!isValidSlug(slug)) return
  app.log.info({ event, slug }, 'file changed on disk')
  void ingestFile(slug, path, event).catch((error: unknown) => {
    app.log.error({ err: error, slug }, 'file ingest failed')
  })
})

/**
 * The server is the only thing that writes a document from the editor; any other
 * change to the file is someone else's text. Our own writes are recognised by
 * the hash we recorded, so they never come back as suggestions.
 */
async function ingestFile(slug: string, path: string, event: 'add' | 'change') {
  // A file appearing under a name that already has CRDT state is a rename, not an
  // edit: the load path owns it, and diffing it here produces noise like a hunk that
  // deletes two newlines.
  if (event === 'add' && existsSync(sidecarPathFor(config, slug))) return

  const body = normalizeMarkdown(await readFile(path, 'utf8'))
  if (collab.lastWritten.get(slug) === hashOf(body)) return

  const connection = await openDocument(slug)
  try {
    const result = await proposeMarkdown(connection, body, 'file')
    app.log.info(
      { slug, hunks: result.created.length, errors: result.errors },
      'file change turned into suggestions',
    )
  } finally {
    await connection.disconnect()
  }
}

// --- static app + single-port websocket -------------------------------------

const webRoot = resolve('dist/web')
if (existsSync(webRoot)) {
  // Wildcard matching keeps newly built asset hashes servable without a restart.
  await app.register(fastifyStatic, { root: webRoot, wildcard: true })
  app.setNotFoundHandler((request, reply) => {
    const url = request.raw.url ?? '/'
    if (url.startsWith('/api/') || /\.[a-z0-9]+$/i.test(url.split('?')[0] ?? '')) {
      reply.code(404).send({ error: 'not found' })
      return
    }
    // Client-side routes (/d/<slug>) all resolve to the app shell.
    reply.sendFile('index.html', { maxAge: 0 })
  })
} else {
  app.log.warn('dist/web is missing — run `pnpm build:web`')
  app.setNotFoundHandler((request, reply) => {
    if (request.raw.url?.startsWith('/api/')) {
      reply.code(404).send({ error: 'not found' })
      return
    }
    reply.type('text/plain').send('paddo: the web app has not been built yet (pnpm build:web)')
  })
}

app.server.on('upgrade', (request, socket, head) => {
  // Refuse the socket itself, not just the protocol: an unauthenticated client
  // never gets a connection to talk into.
  const cookie = readCookie(request.headers.cookie, SESSION_COOKIE)
  const url = new URL(request.url ?? '/', 'http://localhost')
  const headerToken = request.headers.authorization?.replace(/^Bearer /i, '')
  // Header only: `PADDO_TOKEN` in a query string lands in proxy and server logs.
  const tokenOk = Boolean(headerToken && constantTimeEquals(headerToken, config.token))

  if (!verifySession(config.secret, cookie) && !tokenOk) {
    socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n')
    socket.destroy()
    return
  }

  collab.server.httpServer.emit('upgrade', request, socket, head)
})

await app.listen({ port: config.port, host: config.host })
app.log.info(`paddo listening on http://${config.host}:${config.port} — content: ${config.contentDir}`)

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void app.close().then(() => process.exit(0))
  })
}
