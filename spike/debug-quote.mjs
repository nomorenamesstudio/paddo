import { readFile } from 'node:fs/promises'
import { HocuspocusProvider } from '@hocuspocus/provider'
import * as Y from 'yjs'
import { flatten, locateQuote } from '../src/server/anchors'

const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const doc = new Y.Doc()
const provider = new HocuspocusProvider({ url: `ws://127.0.0.1:4319/?token=${env.PADDO_TOKEN}`, name: 'agent-test', document: doc })
await new Promise((resolve, reject) => { provider.on('synced', resolve); setTimeout(() => reject(new Error('timeout')), 8000) })

const flat = flatten(doc.getXmlFragment('content'))
const at = flat.text.indexOf('This paragraph')
console.log('flat around the paragraph:', JSON.stringify(flat.text.slice(Math.max(0, at - 20), at + 140)))

for (const quote of [
  'This paragraph is here to be deleted.',
  'This paragraph is here to be deleted. It adds nothing at all and everyone knows it.',
  'This paragraph is here to be deleted. It adds nothing at all and everyone knows it.\n\n',
  '  This paragraph is here to be deleted.  ',
]) {
  const found = locateQuote(flat, quote)
  console.log(JSON.stringify(quote).slice(0, 60), '->', found.ok ? 'ok' : `${found.error} (${found.matches.length})`)
}
provider.destroy(); doc.destroy()
