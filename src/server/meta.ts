import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { Config } from './config'
import { isValidSlug } from './documents'

/** What a document is to the writer right now, not what the file contains. */
export const STATUSES = ['draft', 'editing', 'published', 'archived'] as const
export type Status = (typeof STATUSES)[number]

export const DEFAULT_STATUS: Status = 'draft'

export interface DocumentMeta {
  status: Status
}

export function isStatus(value: unknown): value is Status {
  return typeof value === 'string' && (STATUSES as readonly string[]).includes(value)
}

function metaPath(config: Config, slug: string): string {
  if (!isValidSlug(slug)) throw new Error(`invalid document slug: ${slug}`)
  return join(config.sidecarDir, `${slug}.meta.json`)
}

export async function readStatus(config: Config, slug: string): Promise<Status> {
  try {
    const raw = await readFile(metaPath(config, slug), 'utf8')
    const parsed = JSON.parse(raw) as { status?: unknown }
    return isStatus(parsed.status) ? parsed.status : DEFAULT_STATUS
  } catch {
    // No metadata yet: every document starts as a draft.
    return DEFAULT_STATUS
  }
}

export async function writeStatus(config: Config, slug: string, status: Status): Promise<void> {
  await mkdir(config.sidecarDir, { recursive: true })
  await writeFile(metaPath(config, slug), `${JSON.stringify({ status }, null, 2)}\n`, 'utf8')
}

export async function readAllStatuses(config: Config, slugs: string[]): Promise<Map<string, Status>> {
  const pairs = await Promise.all(slugs.map(async (slug) => [slug, await readStatus(config, slug)] as const))
  return new Map(pairs)
}
