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
import { createCollab } from './collab'
import { loadConfig, type Config } from './config'
import {
  createDocument,
  createDraft,
  deleteSidecar,
  hashOf,
  isValidSlug,
  listDocuments,
  normalizeMarkdown,
  readDocument,
  removeDocument,
  sidecarPathFor,
  titleOf,
} from './documents'
import { proposeEdits, proposeMarkdown, type ProposeEdit } from './ingest'
import { isStatus, readAllStatuses, readStatus, removeStatus, writeStatus } from './meta'
import { normalizeSettings, readSettings, writeSettings } from './settings'

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

function hasToken(request: FastifyRequest): boolean {
  const header = request.headers.authorization
  if (!header?.startsWith('Bearer ')) return false
  return constantTimeEquals(header.slice(7), config.token)
}

function isAuthorised(request: FastifyRequest): boolean {
  return hasSession(request) || hasToken(request)
}

function requireSession(request: FastifyRequest, reply: FastifyReply, done: () => void) {
  if (!isAuthorised(request)) {
    reply.code(401).send({ error: 'unauthorised' })
    return
  }
  done()
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

app.get('/api/documents', { preHandler: requireSession }, async () => {
  const documents = await listDocuments(config)
  const statuses = await readAllStatuses(
    config,
    documents.map((document) => document.slug),
  )
  return {
    documents: documents.map((document) => ({
      ...document,
      status: statuses.get(document.slug) ?? 'draft',
    })),
  }
})

app.post('/api/documents', { preHandler: requireSession }, async (request, reply) => {
  const body = request.body as { name?: unknown } | undefined
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  try {
    // No name: an untitled draft, named by whatever heading the writer types.
    return name ? await createDocument(config, name) : await createDraft(config)
  } catch (error) {
    reply.code(409).send({ error: (error as Error).message })
    return
  }
})

app.get('/api/documents/:slug', { preHandler: requireSession }, async (request, reply) => {
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
    reply.code(404).send({ error: 'no such document' })
    return
  }
})

app.get('/api/settings', { preHandler: requireSession }, async () => readSettings(config))

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

app.get('/api/documents/:slug/suggestions', { preHandler: requireSession }, async (request, reply) => {
  const { slug } = request.params as { slug: string }
  if (!isValidSlug(slug)) {
    reply.code(400).send({ error: 'invalid document name' })
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

app.post('/api/documents/:slug/suggestions', { preHandler: requireSession }, async (request, reply) => {
  const { slug } = request.params as { slug: string }
  if (!isValidSlug(slug)) {
    reply.code(400).send({ error: 'invalid document name' })
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
    // drops or marks the record, for rejections made outside the UI.
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
  const queryToken = url.searchParams.get('token')
  const headerToken = request.headers.authorization?.replace(/^Bearer /i, '')
  const tokenOk =
    (queryToken && constantTimeEquals(queryToken, config.token)) ||
    (headerToken && constantTimeEquals(headerToken, config.token))

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
