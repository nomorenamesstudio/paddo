/** Put the demo paragraph back where it belongs, through the CRDT. */
import { readFile } from 'node:fs/promises'
import { HocuspocusProvider } from '@hocuspocus/provider'
import * as Y from 'yjs'

const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))

const doc = new Y.Doc()
const provider = new HocuspocusProvider({
  url: `ws://127.0.0.1:4319/?token=${env.PADDO_TOKEN}`,
  name: 'the-quiet-interface',
  document: doc,
})
await new Promise((resolve, reject) => {
  provider.on('synced', resolve)
  setTimeout(() => reject(new Error('timeout')), 8000)
})

const fragment = doc.getXmlFragment('content')
const blocks = fragment.toArray()
const texts = blocks.map((node) => node.toString())
const wanted = texts.findIndex((text) => text.startsWith('Most software fights this moment'))
console.log('blocks:', texts.length, 'current index of paragraph:', wanted)

if (wanted > 1) {
  doc.transact(() => {
    const block = fragment.get(wanted)
    const json = block.toJSON ? block.toJSON() : null
    void json
    fragment.delete(wanted, 1)
    fragment.insert(1, [block])
  })
}
await new Promise((resolve) => setTimeout(resolve, 1500))
provider.destroy()
doc.destroy()
console.log('order now:', fragment.toArray().map((n) => n.toString().slice(0, 22)))
