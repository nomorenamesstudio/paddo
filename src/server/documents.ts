import { link, mkdir, readdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { createHash, randomBytes } from 'node:crypto'
import { dirname, join } from 'node:path'

import { rememberAlias } from './aliases'
import type { Config } from './config'

export interface DocumentMeta {
  slug: string
  title: string
  words: number
  updatedAt: number
  bytes: number
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function isValidSlug(slug: string): boolean {
  return SLUG.test(slug) && slug.length <= 64
}

export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    // The slice can land on a hyphen, and a slug that ends in one fails the pattern
    // above — a long title could not be saved at all ("invalid document slug").
    .replace(/-+$/, '')
}

/** Inline markdown is markup, not part of the title a reader sees in the list. */
export function plainTitle(text: string): string {
  return text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

export function titleOf(markdownText: string, slug: string): string {
  const heading = markdownText.match(/^#\s+(.+)$/m)
  if (heading?.[1]) return plainTitle(heading[1]) || slug
  const firstLine = markdownText.split('\n').find((line) => line.trim() !== '')
  const title = firstLine ? plainTitle(firstLine).slice(0, 120) : ''
  return title || slug
}

export function wordCount(markdownText: string): number {
  return markdownText.split(/\s+/).filter(Boolean).length
}

export function hashOf(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

/** Exactly one trailing newline, so a save never looks like a whitespace change. */
export function normalizeMarkdown(text: string): string {
  return `${text.replace(/[\s\uFEFF\u00A0]+$/u, '')}\n`
}

export function pathFor(config: Config, slug: string): string {
  if (!isValidSlug(slug)) throw new Error(`invalid document slug: ${slug}`)
  return join(config.contentDir, `${slug}.md`)
}

export function sidecarPathFor(config: Config, slug: string): string {
  if (!isValidSlug(slug)) throw new Error(`invalid document slug: ${slug}`)
  return join(config.sidecarDir, `${slug}.y`)
}

export async function listDocuments(config: Config): Promise<DocumentMeta[]> {
  let entries: string[]
  try {
    entries = await readdir(config.contentDir)
  } catch {
    await mkdir(config.contentDir, { recursive: true })
    return []
  }

  const documents: DocumentMeta[] = []
  for (const entry of entries) {
    if (!entry.endsWith('.md')) continue
    const slug = entry.slice(0, -3)
    if (!isValidSlug(slug)) continue
    try {
      const [body, info] = await Promise.all([
        readFile(join(config.contentDir, entry), 'utf8'),
        stat(join(config.contentDir, entry)),
      ])
      documents.push({
        slug,
        title: titleOf(body, slug),
        words: wordCount(body),
        updatedAt: info.mtimeMs,
        bytes: info.size,
      })
    } catch {
      // A file that vanished between readdir and read is not worth failing over.
    }
  }

  return documents.sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function readDocument(config: Config, slug: string): Promise<string> {
  return readFile(pathFor(config, slug), 'utf8')
}

export async function writeDocument(config: Config, slug: string, body: string): Promise<void> {
  const target = pathFor(config, slug)
  await mkdir(dirname(target), { recursive: true })
  // A random suffix, not just the pid: two saves of the same document in one process
  // would otherwise share a temp file and one of them would rename nothing.
  const temp = `${target}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`
  await writeFile(temp, normalizeMarkdown(body), 'utf8')
  await rename(temp, target)
}

/**
 * Creates a file only if the name is free. `wx` fails with EEXIST instead of writing,
 * which is what stops two creates picking the same slug and one destroying the other.
 */
async function writeNewDocument(config: Config, slug: string, body: string): Promise<void> {
  const target = pathFor(config, slug)
  await mkdir(dirname(target), { recursive: true })
  try {
    await writeFile(target, normalizeMarkdown(body), { encoding: 'utf8', flag: 'wx' })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Error(`document already exists: ${slug}`)
    }
    throw error
  }
}

/**
 * A draft with no name yet. The heading is the name, so it is written in place
 * and can be edited like any other heading.
 */
export async function createDraft(config: Config): Promise<DocumentMeta> {
  const base = 'new-draft'
  let slug = base
  let free = false
  for (let attempt = 2; attempt < 100; attempt += 1) {
    try {
      await stat(pathFor(config, slug))
      slug = `${base}-${attempt}`
    } catch {
      free = true
      break
    }
  }
  // Ninety-nine drafts that all share a name: stop guessing and take a name that
  // cannot be there yet, rather than writing over the last one it tried.
  if (!free) slug = `${base}-${Date.now()}`

  await writeDocument(config, slug, '# New draft\n\n')
  const info = await stat(pathFor(config, slug))
  return { slug, title: 'New draft', words: 0, updatedAt: info.mtimeMs, bytes: info.size }
}

export async function createDocument(config: Config, name: string): Promise<DocumentMeta> {
  const slug = slugify(name)
  if (!slug) throw new Error('a document needs a name')

  const title = name.trim()
  await writeNewDocument(config, slug, `# ${title}\n\n`)
  const info = await stat(pathFor(config, slug))
  return { slug, title, words: 0, updatedAt: info.mtimeMs, bytes: info.size }
}

/**
 * A document that arrives with its text — an agent dropping a draft in. The heading
 * is taken from the markdown when there is one; the name is the fallback.
 */
export async function createDocumentWithMarkdown(
  config: Config,
  name: string,
  markdown: string,
): Promise<DocumentMeta> {
  const body = normalizeMarkdown(markdown)
  const title = titleOf(body, slugify(name) || 'untitled')
  const slug = slugify(title) || slugify(name)
  if (!slug) throw new Error('a document needs a name or a heading')

  await writeNewDocument(config, slug, body)
  const info = await stat(pathFor(config, slug))
  return { slug, title, words: wordCount(body), updatedAt: info.mtimeMs, bytes: info.size }
}

/** A title turned into a filename: the writer will see this on disk. */
export async function freeSlug(config: Config, wanted: string, keep?: string): Promise<string> {
  const base = slugify(wanted) || 'untitled'
  let candidate = base
  for (let attempt = 2; attempt < 100; attempt += 1) {
    if (candidate === keep) return candidate
    try {
      await stat(pathFor(config, candidate))
    } catch {
      return candidate
    }
    candidate = `${base}-${attempt}`
  }
  return `${base}-${Date.now()}`
}

/**
 * Moves a document to a new slug on disk: markdown, CRDT sidecar and status file.
 * The writer reads these files by hand, so the name has to be the title, not the
 * name it was born with.
 */
export async function renameDocument(config: Config, from: string, to: string): Promise<void> {
  if (from === to) return
  // Sidecar and status first: the watcher must never see the markdown under its new
  // name before the CRDT state has moved with it, or the file looks like a new one.
  await moveExclusive(sidecarPathFor(config, from), sidecarPathFor(config, to))
  await moveExclusive(
    join(config.sidecarDir, `${from}.meta.json`),
    join(config.sidecarDir, `${to}.meta.json`),
  )
  // The markdown last, and never over an existing file: `rename` would destroy the
  // document that is already there.
  await moveExclusive(pathFor(config, from), pathFor(config, to))
  // The old address keeps working: a sleeping tab or a bookmark resolves to this one.
  await rememberAlias(config, from, to)
}

/**
 * Moves a file only onto a free name. `link` fails with EEXIST if the target exists,
 * which is the whole point: two documents that share a title can pick the same free
 * slug within milliseconds, and the loser must fail loudly instead of overwriting.
 */
async function moveExclusive(from: string, to: string): Promise<void> {
  try {
    await link(from, to)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return // nothing to move
    if (code === 'EEXIST') throw new Error(`rename target already exists: ${to}`)
    // A filesystem without hard links: fall back to rename, still refusing an
    // existing target by checking first.
    try {
      await stat(to)
      throw new Error(`rename target already exists: ${to}`)
    } catch (statError) {
      if ((statError as NodeJS.ErrnoException).code !== 'ENOENT') throw statError
    }
    await rename(from, to)
    return
  }
  await unlink(from).catch(() => {
    // The copy exists; a failed unlink leaves a stale name, not a lost document.
  })
}

/** Removes the markdown file itself. Missing files are not an error. */
export async function removeDocument(config: Config, slug: string): Promise<void> {
  try {
    await unlink(pathFor(config, slug))
  } catch {
    // Already gone.
  }
}

export async function deleteSidecar(config: Config, slug: string): Promise<void> {
  try {
    await unlink(sidecarPathFor(config, slug))
  } catch {
    // No sidecar, nothing to clean up.
  }
}
