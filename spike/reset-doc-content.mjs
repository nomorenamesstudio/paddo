/** Put a document back to the committed markdown, through the CRDT. */
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { HocuspocusProvider } from '@hocuspocus/provider'
import * as Y from 'yjs'
import { seedDocumentFromMarkdown } from '../src/server/collab'

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
console.log('before:', fragment.length, 'blocks')
doc.transact(() => fragment.delete(0, fragment.length))
await new Promise((resolve) => setTimeout(resolve, 300))
console.log('cleared:', fragment.length, 'blocks, seeded:', seedDocumentFromMarkdown(doc, committed))
await new Promise((resolve) => setTimeout(resolve, 1500))
provider.destroy()
doc.destroy()
