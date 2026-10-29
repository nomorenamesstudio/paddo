/**
 * Compact one document's CRDT sidecar: `node --import tsx tools/compact-sidecar.mjs <slug>`
 *
 * Stores compact on their own now (`src/server/compaction.ts`), so this is the repair
 * path for a file that grew before that existed. It refuses to write unless the prose
 * and the suggestion count are unchanged, and it keeps no copy: take one first if the
 * document matters.
 */
import { readFile, rename, writeFile } from 'node:fs/promises'
import * as Y from 'yjs'
import { compactPositionMigrations } from '../src/server/compaction.ts'

const slug = process.argv[2]
if (!slug) throw new Error('usage: repair-sidecar.mjs <slug>')
const path = `.paddo/${slug}.y`
const doc = new Y.Doc()
Y.applyUpdate(doc, new Uint8Array(await readFile(path)))
const textBefore = doc.getXmlFragment('content').toString()
const suggestionsBefore = doc.getMap('suggestions').size

const before = Y.encodeStateAsUpdate(doc).length
const result = compactPositionMigrations(doc)
const after = Y.encodeStateAsUpdate(doc)

if (doc.getXmlFragment('content').toString() !== textBefore) throw new Error('text changed — refusing to write')
if (doc.getMap('suggestions').size !== suggestionsBefore) throw new Error('suggestions changed — refusing')

const temp = `${path}.${process.pid}.tmp`
await writeFile(temp, after)
await rename(temp, path)
console.log(JSON.stringify({ path, beforeBytes: before, afterBytes: after.length, ...result }))
