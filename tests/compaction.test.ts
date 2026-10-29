import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'

import { compactPositionMigrations, MIGRATION_PREFIX } from '../src/server/compaction'

const store = (doc: Y.Doc) => doc.getMap<Record<string, unknown>>(`${MIGRATION_PREFIX}root:content`)

/** A record as TipTap writes it: keyed `${client}:${clock}`, with a causal vector. */
function record(client: number, clock: number, seen: Array<[number, number]> = []) {
  return { version: 1, client, clock, seen, transfers: [] as unknown[] }
}

describe('TipTap position-migration compaction', () => {
  it('leaves a small map alone', () => {
    const doc = new Y.Doc()
    const map = store(doc)
    for (let index = 0; index < 6; index += 1) {
      map.set(`${index}:${index}`, record(index, index))
    }

    const before = [...map.keys()]
    expect(compactPositionMigrations(doc).dropped).toBe(0)
    expect([...map.keys()]).toEqual(before)
  })

  it('drops records another record has causally seen, and keeps the unseen ones', () => {
    const doc = new Y.Doc()
    const map = store(doc)
    // Old records, each superseded by a later one that has heard from them.
    for (let index = 0; index < 10; index += 1) {
      map.set(`${index}:${index}`, record(index, index, [[1, 100]]))
    }
    // The newest record has seen every older client, which is what supersedes them.
    const seen = Array.from({ length: 10 }, (_, index) => [index, index + 1] as [number, number])
    map.set('999:999', record(999, 999, seen))

    const result = compactPositionMigrations(doc)

    expect(result.dropped).toBeGreaterThan(0)
    expect(map.has('999:999')).toBe(true)
    // The floor protects the newest records whatever their causal vector says.
    expect(map.size).toBeGreaterThanOrEqual(4)
  })

  it('never drops a newer record while an older one survives', () => {
    const doc = new Y.Doc()
    const map = store(doc)
    // Every older record claims to have seen the newest one — the wrong direction.
    for (let index = 0; index < 10; index += 1) {
      map.set(`${index}:${index}`, record(index, index, [[500, 501]]))
    }
    map.set('500:500', record(500, 500, []))

    compactPositionMigrations(doc)

    // Dropping the newest would apply a superseded relocation; it has to stay.
    expect(map.has('500:500')).toBe(true)
  })

  it('caps an oversized causal vector without inventing entries', () => {
    const doc = new Y.Doc()
    const map = store(doc)
    const seen = Array.from({ length: 400 }, (_, index) => [index, index] as [number, number])
    for (let index = 0; index < 9; index += 1) {
      map.set(`${index}:${index}`, record(index, index, seen))
    }

    const result = compactPositionMigrations(doc)
    expect(result.capped).toBeGreaterThan(0)

    for (const value of map.values()) {
      const vector = (value as { seen: Array<[number, number]> }).seen
      expect(vector.length).toBeLessThanOrEqual(256)
      for (const [client, clock] of vector) {
        expect(seen).toContainEqual([client, clock])
      }
    }
  })

  it('leaves the document text and other maps untouched', () => {
    const doc = new Y.Doc()
    const fragment = doc.getXmlFragment('content')
    const paragraph = new Y.XmlElement('paragraph')
    const text = new Y.XmlText()
    text.insert(0, 'the quiet interface')
    paragraph.insert(0, [text])
    fragment.insert(0, [paragraph])

    const map = store(doc)
    for (let index = 0; index < 12; index += 1) {
      map.set(`${index}:${index}`, record(index, index, [[1, 50]]))
    }
    map.set('900:900', record(900, 900, Array.from({ length: 12 }, (_, i) => [i, i + 1] as [number, number])))

    compactPositionMigrations(doc)

    expect(fragment.toString()).toContain('the quiet interface')
  })
})
