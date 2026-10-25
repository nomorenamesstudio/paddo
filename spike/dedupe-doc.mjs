/** Remove repeated copies of a document that a CRDT merge duplicated. */
import { readFile } from 'node:fs/promises'
import { HocuspocusProvider } from '@hocuspocus/provider'
import * as Y from 'yjs'

const slug = process.argv[2] ?? 'the-quiet-interface'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))

const doc = new Y.Doc()
const provider = new HocuspocusProvider({
  url: `ws://127.0.0.1:4319/?token=${env.PADDO_TOKEN}`,
  name: slug,
  document: doc,
})
await new Promise((resolve, reject) => {
  provider.on('synced', resolve)
  setTimeout(() => reject(new Error('timeout syncing')), 8000)
})

const fragment = doc.getXmlFragment('content')
const blocks = () => fragment.toArray().map((node) => node.toString())

const all = blocks()
const first = all[0]
let copies = 0
for (let index = 0; index < all.length; index += 1) if (all[index] === first) copies += 1

// Each copy is identical, so the copy length is the distance between two starts.
const starts = all.map((text, index) => (text === first ? index : -1)).filter((index) => index >= 0)
const copyLength = starts.length > 1 ? starts[1] - starts[0] : 0

let removed = 0
if (copies > 1 && copyLength > 0) {
  doc.transact(() => {
    for (let index = fragment.length - 1; index >= copyLength; index -= 1) {
      fragment.delete(index, 1)
      removed += 1
    }
  })
}

await new Promise((resolve) => setTimeout(resolve, 1500))
provider.destroy()
doc.destroy()
console.log(JSON.stringify({ blocks: all.length, copies, copyLength, removed }))
