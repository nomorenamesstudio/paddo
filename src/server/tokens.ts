import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { Config } from './config'
import { isValidSlug } from './documents'

/** What a token may do. Reading includes listing and exporting. */
export const VERBS = ['read', 'propose', 'create'] as const
export type Verb = (typeof VERBS)[number]

export function isVerb(value: unknown): value is Verb {
  return typeof value === 'string' && (VERBS as readonly string[]).includes(value)
}

/**
 * A minted agent token: a name, a hash, and the two things that decide what it can
 * reach — the verbs, and the documents (`'*'` for every one).
 */
export interface AgentToken {
  id: string
  name: string
  hash: string
  verbs: Verb[]
  documents: '*' | string[]
  createdAt: number
  lastUsedAt?: number
}

/** Never leaves the server with its hash attached. */
export type PublicToken = Omit<AgentToken, 'hash'>

export function hashToken(secret: string): string {
  return createHash('sha256').update(secret).digest('hex')
}

function sameHash(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8')
  const right = Buffer.from(b, 'utf8')
  return left.length === right.length && timingSafeEqual(left, right)
}

function storePath(config: Config): string {
  return join(config.sidecarDir, 'tokens.json')
}

export function publicToken(token: AgentToken): PublicToken {
  const { hash: _hash, ...rest } = token
  return rest
}

/** Documents in scope for this token, as a predicate. `'*'` is the whole library. */
export function reaches(token: AgentToken, slug: string): boolean {
  return token.documents === '*' || token.documents.includes(slug)
}

/** A token may act on a document only when it holds the verb *and* the document. */
export function allows(token: AgentToken, verb: Verb, slug: string): boolean {
  return token.verbs.includes(verb) && reaches(token, slug)
}

async function readStore(config: Config): Promise<AgentToken[]> {
  try {
    const raw = await readFile(storePath(config), 'utf8')
    const parsed = JSON.parse(raw) as { tokens?: unknown }
    if (!Array.isArray(parsed.tokens)) return []
    return parsed.tokens.filter((entry): entry is AgentToken => {
      if (typeof entry !== 'object' || entry === null) return false
      const token = entry as Partial<AgentToken>
      return (
        typeof token.id === 'string' &&
        typeof token.name === 'string' &&
        typeof token.hash === 'string' &&
        Array.isArray(token.verbs) &&
        token.verbs.every(isVerb) &&
        (token.documents === '*' || Array.isArray(token.documents))
      )
    })
  } catch {
    return []
  }
}

/**
 * One writer at a time: every mutation is a read-modify-write of the same file, and a
 * `lastUsedAt` write fired by a request can otherwise land on top of a revoke and put
 * the revoked token back.
 */
let writing: Promise<unknown> = Promise.resolve()

function serialise<T>(work: () => Promise<T>): Promise<T> {
  const run = writing.then(work, work)
  writing = run.catch(() => {
    // A failed write must not wedge the queue.
  })
  return run
}

async function writeStore(config: Config, tokens: AgentToken[]): Promise<void> {
  await mkdir(config.sidecarDir, { recursive: true })
  const target = storePath(config)
  const temp = `${target}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`
  await writeFile(temp, `${JSON.stringify({ tokens }, null, 2)}\n`, 'utf8')
  await rename(temp, target)
}

/** Reads, mutates and writes under the same lock, so a mutation cannot lose a race. */
async function mutateStore<T>(
  config: Config,
  change: (tokens: AgentToken[]) => { tokens?: AgentToken[]; result: T },
): Promise<T> {
  return serialise(async () => {
    const tokens = await readStore(config)
    const { tokens: next, result } = change(tokens)
    if (next) await writeStore(config, next)
    return result
  })
}


export async function listTokens(config: Config): Promise<PublicToken[]> {
  const tokens = await readStore(config)
  return tokens
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(publicToken)
}

export interface MintInput {
  name: string
  verbs: Verb[]
  documents: '*' | string[]
}

/** Validates what the settings form sent; throws with a readable message. */
export function normalizeMint(input: unknown): MintInput {
  const body = (input ?? {}) as { name?: unknown; verbs?: unknown; documents?: unknown }

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) throw new Error('a token needs a name')
  if (name.length > 60) throw new Error('token names are 60 characters at most')

  const verbs = Array.isArray(body.verbs) ? body.verbs.filter(isVerb) : []
  if (verbs.length === 0) throw new Error('pick at least one permission: read, propose or create')

  let documents: '*' | string[] = '*'
  if (body.documents !== '*') {
    if (!Array.isArray(body.documents)) throw new Error('documents must be "*" or a list of slugs')
    const slugs = [...new Set(body.documents.filter((value): value is string => typeof value === 'string'))]
    const invalid = slugs.filter((slug) => !isValidSlug(slug))
    if (invalid.length > 0) throw new Error(`invalid document name: ${invalid[0]}`)
    // An empty list would look scoped but reach nothing: minting one is a mistake.
    if (slugs.length === 0) throw new Error('pick at least one document, or allow them all')
    documents = slugs
  }

  return { name, verbs, documents }
}

export async function mintToken(
  config: Config,
  input: MintInput,
): Promise<{ token: PublicToken; secret: string }> {
  const secret = `paddo_${randomBytes(24).toString('base64url')}`
  const token: AgentToken = {
    id: `tok_${randomBytes(6).toString('hex')}`,
    name: input.name,
    hash: hashToken(secret),
    verbs: input.verbs,
    documents: input.documents,
    createdAt: Date.now(),
  }
  await mutateStore(config, (tokens) => {
    tokens.push(token)
    return { tokens, result: null }
  })
  return { token: publicToken(token), secret }
}

export async function revokeToken(config: Config, id: string): Promise<boolean> {
  return mutateStore(config, (tokens) => {
    const kept = tokens.filter((token) => token.id !== id)
    if (kept.length === tokens.length) return { result: false }
    return { tokens: kept, result: true }
  })
}

/**
 * A token created a document, so the document joins that token's scope: otherwise a
 * scoped agent would drop a file in and immediately lose the right to read it back.
 */
export async function grantDocument(config: Config, id: string, slug: string): Promise<void> {
  await mutateStore(config, (tokens) => {
    const token = tokens.find((entry) => entry.id === id)
    if (!token || token.documents === '*' || token.documents.includes(slug)) return { result: null }
    token.documents = [...token.documents, slug]
    return { tokens, result: null }
  })
}

/**
 * `lastUsedAt` is written at most once a minute per token: it is a convenience for
 * the settings list, not an audit log, and every request does not need a disk write.
 */
const touch = new Map<string, number>()

export async function verifyToken(config: Config, secret: string): Promise<AgentToken | null> {
  if (!secret.startsWith('paddo_')) return null
  const hash = hashToken(secret)
  const tokens = await readStore(config)
  const token = tokens.find((entry) => sameHash(entry.hash, hash))
  if (!token) return null

  const now = Date.now()
  if (now - (touch.get(token.id) ?? 0) > 60_000) {
    touch.set(token.id, now)
    void mutateStore(config, (current) => {
      // Re-read under the lock: a revoke that happened meanwhile must win.
      const found = current.find((entry) => entry.id === token.id)
      if (!found) return { result: null }
      found.lastUsedAt = now
      return { tokens: current, result: null }
    }).catch(() => {
      // A token that cannot record its use is still usable.
    })
  }
  return token
}
