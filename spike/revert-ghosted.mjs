/**
 * Puts the four sentences my bar probe accepted back to what he wrote. Through the
 * CRDT, so any open tab follows live, and in one transaction so it lands as one edit.
 */
import { readFile } from 'node:fs/promises'
import { HocuspocusProvider } from '@hocuspocus/provider'
import * as Y from 'yjs'
import { flatten } from '../src/server/anchors.ts'

const original = (await readFile('.cache/ghosted-original.md', 'utf8')).split('\n')
const current = (await readFile('content/new-draft-6.md', 'utf8')).split('\n')
const pairs = [7, 13, 17, 27]
  .filter((line) => original[line - 1] !== current[line - 1])
  .map((line) => ({ from: current[line - 1], to: original[line - 1] }))

console.log('replacing', pairs.length, 'sentences')

const env = Object.fromEntries((await readFile('.env', 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))

const ydoc = new Y.Doc()
const provider = new HocuspocusProvider({
  url: `ws://127.0.0.1:4319/?token=${env.PADDO_TOKEN}`,
  name: 'new-draft-6',
  document: ydoc,
})
await new Promise((resolve, reject) => {
  provider.on('synced', resolve)
  setTimeout(() => reject(new Error('sync timeout')), 10_000)
})

// The paragraphs as they are in the CRDT, not as read from disk.
const fragment = ydoc.getXmlFragment('content')
const flat = flatten(fragment)

ydoc.transact(() => {
  for (const { from, to } of pairs) {
    const state = flatten(fragment)
    const at = state.text.indexOf(from)
    if (at === -1) throw new Error(`not in the document: ${from.slice(0, 50)}`)
    const first = state.chars[at]
    const last = state.chars[at + from.length - 1]
    if (!first || !last || first.node !== last.node) {
      throw new Error(`spans text nodes: ${from.slice(0, 50)}`)
    }
    first.node.delete(first.index, from.length)
    first.node.insert(first.index, to)
  }
})

await new Promise((resolve) => setTimeout(resolve, 2500))
const after = (await readFile('content/new-draft-6.md', 'utf8')).split('\n')
const remaining = pairs.filter(({ from }) => after.join('\n').includes(from))
console.log(JSON.stringify({
  applied: pairs.length - remaining.length,
  leftover: remaining.map(({ from }) => from.slice(0, 40)),
  matchesOriginal: after.join('\n') === original.join('\n'),
}, null, 2))

provider.destroy()
ydoc.destroy()
