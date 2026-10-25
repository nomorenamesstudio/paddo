/**
 * Live round-trip check against a running server: connect over the same port,
 * edit through Yjs, and confirm the markdown file and the sidecar landed.
 *
 * Throwaway verification, not a test.
 */
import { readFile } from 'node:fs/promises'

import { HocuspocusProvider } from '@hocuspocus/provider'
import * as Y from 'yjs'

const slug = 'the-quiet-interface'
const token = process.env.PADDO_TOKEN
if (!token) throw new Error('PADDO_TOKEN not set')

const doc = new Y.Doc()
const provider = new HocuspocusProvider({
  url: `ws://127.0.0.1:4319/?token=${token}`,
  name: slug,
  token,
  document: doc,
})

await new Promise<void>((resolve, reject) => {
  provider.on('synced', () => resolve())
  provider.on('authenticationFailed', () => reject(new Error('auth failed')))
  setTimeout(() => reject(new Error('sync timeout')), 6000)
})

const fragment = doc.getXmlFragment('content')
console.log('fragment loaded from markdown:', fragment.length > 0, 'blocks:', fragment.length)

const firstInfo = fragment.get(0) as Y.XmlElement
const text = firstInfo.get(0) as Y.XmlText
text.insert(text.length, ' PROBE')

await new Promise((resolve) => setTimeout(resolve, 2500))
provider.destroy()
doc.destroy()

const body = await readFile(new URL('../content/the-quiet-interface.md', import.meta.url), 'utf8')
const sidecar = await readFile(new URL('../.paddo/the-quiet-interface.y', import.meta.url)).catch(() => null)

console.log('markdown saved with the edit:', body.includes('PROBE'))
console.log('sidecar written:', sidecar !== null && sidecar.byteLength > 0)
console.log('italics still underscores:', body.includes('_Italics_'))
console.log('em dash survived:', body.includes('—'))
console.log('trailing newline count ok:', body.endsWith('paragraph.\n'))
