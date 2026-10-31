import type * as Y from 'yjs'

/**
 * Compaction for TipTap's position-migration records.
 *
 * `@tiptap/y-tiptap` writes one record per structural migration into a map named
 * `__tiptap_position_migrations:<root>`, keyed `${clientID}:${clock}`, each holding a
 * `transfers` list and a `seen` state vector. The map is append-only, so it grows
 * without bound: one document here reached 15.8 MB of records for 282 words, and every
 * open pays for parsing it.
 *
 * What may be dropped is decided by the library's own rule (see
 * `getPositionMigrationCandidates`): a record is superseded when another record's
 * `seen` covers its `(client, clock)`, because that later record carries the final
 * mapping for the same content. Dropping a *superseded* record therefore changes
 * nothing; dropping a record nothing has seen would lose a relocation.
 *
 * There is no "keep the newest N" floor: `clock` is a per-client counter, so records
 * from different clients cannot be ordered by it, and a floor built on that ordering
 * protects whichever client has written the most rather than the recent work.
 *
 * The `seen` vectors are capped too. A truncated vector can only fail to prove
 * supersession, which costs a relocation (a stale hunk gets pruned) and never moves a
 * position to the wrong place.
 */

export const MIGRATION_PREFIX = '__tiptap_position_migrations:'


/** Nothing happens below this many records: small maps are not worth touching. */
const COMPACT_ABOVE = 8

/** Per-record cap on the causal vector. */
const SEEN_LIMIT = 256

interface MigrationRecord {
  version: 1
  client: number
  clock: number
  seen: Array<[number, number]>
  transfers: unknown[]
}

function isRecord(value: unknown): value is MigrationRecord {
  if (!value || typeof value !== 'object') return false
  const record = value as Partial<MigrationRecord>
  return (
    typeof record.client === 'number' &&
    typeof record.clock === 'number' &&
    Array.isArray(record.seen) &&
    Array.isArray(record.transfers)
  )
}

/** `seen` covers the record when it has heard from that client past that clock. */
function covers(other: MigrationRecord, record: MigrationRecord): boolean {
  return other.seen.some(([client, clock]) => client === record.client && clock > record.clock)
}

/** Keeps the entries that matter: the highest clock per client, capped. */
function capSeen(seen: Array<[number, number]>): Array<[number, number]> {
  if (seen.length <= SEEN_LIMIT) return seen
  const latest = new Map<number, number>()
  for (const [client, clock] of seen) {
    const known = latest.get(client) ?? -1
    if (clock > known) latest.set(client, clock)
  }
  return [...latest.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, SEEN_LIMIT)
}

export interface CompactionResult {
  records: number
  dropped: number
  capped: number
}

export function compactPositionMigrations(doc: Y.Doc): CompactionResult {
  let records = 0
  let dropped = 0
  let capped = 0

  for (const key of [...doc.share.keys()]) {
    if (!key.startsWith(MIGRATION_PREFIX)) continue
    const store = doc.getMap<unknown>(key)

    const entries = [...store.entries()].filter(
      (entry): entry is [string, MigrationRecord] => isRecord(entry[1]),
    )
    records += entries.length
    if (entries.length === 0) continue

    const removals: string[] = []
    if (entries.length > COMPACT_ABOVE) {
      for (const [key, record] of entries) {
        // Only a record another one has causally seen may go.
        if (entries.some(([otherKey, other]) => otherKey !== key && covers(other, record))) {
          removals.push(key)
        }
      }
    }

    const trims: Array<[string, MigrationRecord]> = entries
      .filter(([key]) => !removals.includes(key))
      .filter(([, record]) => record.seen.length > SEEN_LIMIT)
      .map(([key, record]) => [key, record])

    if (removals.length === 0 && trims.length === 0) continue

    doc.transact(() => {
      for (const key of removals) store.delete(key)
      for (const [key, record] of trims) store.set(key, { ...record, seen: capSeen(record.seen) })
    })

    dropped += removals.length
    capped += trims.length
  }

  return { records, dropped, capped }
}
