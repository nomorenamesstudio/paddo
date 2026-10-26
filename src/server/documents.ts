import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'

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
}

export function titleOf(markdownText: string, slug: string): string {
  const heading = markdownText.match(/^#\s+(.+)$/m)
  if (heading?.[1]) return heading[1].trim()
  const firstLine = markdownText.split('\n').find((line) => line.trim() !== '')
  return firstLine?.trim().slice(0, 120) || slug
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
  const temp = `${target}.${process.pid}.tmp`
  await writeFile(temp, normalizeMarkdown(body), 'utf8')
  await rename(temp, target)
}

/**
 * A draft with no name yet. The heading is the name, so it is written in place
 * and can be edited like any other heading.
 */
export async function createDraft(config: Config): Promise<DocumentMeta> {
  const base = 'new-draft'
  let slug = base
  for (let attempt = 2; attempt < 100; attempt += 1) {
    try {
      await stat(pathFor(config, slug))
      slug = `${base}-${attempt}`
    } catch {
      break
    }
  }

  await writeDocument(config, slug, '# New draft\n\n')
  const info = await stat(pathFor(config, slug))
  return { slug, title: 'New draft', words: 0, updatedAt: info.mtimeMs, bytes: info.size }
}

export async function createDocument(config: Config, name: string): Promise<DocumentMeta> {
  const slug = slugify(name)
  if (!slug) throw new Error('a document needs a name')
  const target = pathFor(config, slug)
  try {
    await stat(target)
    throw new Error(`document already exists: ${slug}`)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }

  const title = name.trim()
  await writeDocument(config, slug, `# ${title}\n\n`)
  const info = await stat(target)
  return { slug, title, words: 0, updatedAt: info.mtimeMs, bytes: info.size }
}

export async function deleteSidecar(config: Config, slug: string): Promise<void> {
  try {
    await unlink(sidecarPathFor(config, slug))
  } catch {
    // No sidecar, nothing to clean up.
  }
}
