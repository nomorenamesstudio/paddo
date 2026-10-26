/** Restore the committed markdown in one transaction, so no client can win the race. */
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { HocuspocusProvider } from '@hocuspocus/provider'
import * as Y from 'yjs'
import { yDocFromMarkdown } from '../src/server/collab'

const slug = process.argv[2] ?? 'the-quiet-interface'
const committed = execFileSync('git', ['show', `HEAD:content/${slug}.md`], { encoding: 'utf8' })
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
  setTimeout(() => reject(new Error('timeout')), 8000)
})

const fragment = doc.getXmlFragment('content')
const seed = Y.encodeStateAsUpdate(yDocFromMarkdown(committed))

// Clearing and seeding must land together: a connected editor re-adds an empty
// paragraph the moment the document would otherwise be empty.
doc.transact(() => {
  for (let index = fragment.length - 1; index >= 0; index -= 1) {
    const node = fragment.get(index)
    const text = node.toString().replace(/<[^>]*>/g, '').trim()
    if (text === '') fragment.delete(index, 1)
  }
  Y.applyUpdate(doc, seed)
})

await new Promise((resolve) => setTimeout(resolve, 1500))
console.log('blocks:', fragment.length)
console.log('first:', fragment.get(0)?.toString().slice(0, 40))

await new Promise((resolve) => setTimeout(resolve, 1500))
provider.destroy()
doc.destroy()
