/** Undo the two strings my probe wrote into his draft. */
import { readFile } from 'node:fs/promises'
import { HocuspocusProvider } from '@hocuspocus/provider'
import * as Y from 'yjs'

const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))

const doc = new Y.Doc()
const provider = new HocuspocusProvider({
  url: `ws://127.0.0.1:4319/?token=${env.PADDO_TOKEN}`,
  name: 'wow-this-cool',
  document: doc,
})
await new Promise((resolve, reject) => {
  provider.on('synced', resolve)
  setTimeout(() => reject(new Error('timeout')), 8000)
})

const texts = []
const walk = (node) => {
  for (const child of node.toArray()) {
    if (child instanceof Y.XmlText) texts.push(child)
    else if (child instanceof Y.XmlElement) walk(child)
  }
}
walk(doc.getXmlFragment('content'))

let changes = 0
for (const text of texts) {
  const value = text.toString()
  const typed = ' Typed on the desktop.'
  if (value.includes(typed)) {
    const at = value.indexOf(typed)
    text.delete(at, typed.length)
    changes += 1
  }
  const swapped = value.indexOf('good way to put')
  if (swapped !== -1) {
    text.delete(swapped, 'good'.length)
    text.insert(swapped, 'cool')
    changes += 1
  }
}

await new Promise((resolve) => setTimeout(resolve, 1200))
provider.destroy()
doc.destroy()
console.log('edits applied:', changes)
