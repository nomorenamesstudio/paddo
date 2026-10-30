import { readFile, stat } from 'node:fs/promises'

import * as Y from 'yjs'

import { SUGGESTIONS_MAP, type Suggestion } from '../shared/suggestions'
import type { Config } from './config'
import { sidecarPathFor } from './documents'

/**
 * How many suggested edits are waiting on each document.
 *
 * The live count lives in the document's CRDT map, so the sidecar is the only place
 * that knows it without opening a room. Decoding is cheap now that stores compact
 * their position migrations; the file's size and mtime key a short cache so a list
 * refresh does not re-parse everything.
 */
interface Cached {
  size: number
  mtimeMs: number
  pending: number
}

const cache = new Map<string, Cached>()

export async function countPending(config: Config, slug: string): Promise<number> {
  const path = sidecarPathFor(config, slug)
  let info
  try {
    info = await stat(path)
  } catch {
    // No sidecar: the document has never held a suggestion.
    cache.delete(slug)
    return 0
  }

  const hit = cache.get(slug)
  if (hit && hit.size === info.size && hit.mtimeMs === info.mtimeMs) return hit.pending

  let pending = 0
  try {
    const doc = new Y.Doc()
    Y.applyUpdate(doc, new Uint8Array(await readFile(path)))
    for (const value of doc.getMap<Record<string, unknown>>(SUGGESTIONS_MAP).values()) {
      if ((value as unknown as Suggestion).status === 'pending') pending += 1
    }
    doc.destroy()
  } catch {
    // A sidecar we cannot read is not a reason to fail the list.
    return 0
  }

  cache.set(slug, { size: info.size, mtimeMs: info.mtimeMs, pending })
  return pending
}

export async function countPendingFor(config: Config, slugs: string[]): Promise<Map<string, number>> {
  const pairs = await Promise.all(slugs.map(async (slug) => [slug, await countPending(config, slug)] as const))
  return new Map(pairs)
}
