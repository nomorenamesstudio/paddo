/**
 * Lets the server tidy the existing library: connects to each document whose file
 * name is not its title, disconnects, and the unload hook renames the files.
 */
import { readFile } from 'node:fs/promises'
import { HocuspocusProvider } from '@hocuspocus/provider'
import * as Y from 'yjs'

const env = Object.fromEntries((await readFile('.env', 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const ORIGIN = 'http://127.0.0.1:4319'

const session = await fetch(`${ORIGIN}/api/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ password: env.PADDO_PASSWORD }),
})
const cookie = session.headers.get('set-cookie')?.split(';')[0] ?? ''

const list = await (await fetch(`${ORIGIN}/api/documents`, { headers: { cookie } })).json()
const slugify = (text) =>
  text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64)

const stale = list.documents.filter((doc) => slugify(doc.title) !== doc.slug)
console.log('stale:', stale.map((doc) => `${doc.slug} → ${slugify(doc.title)}`))

for (const doc of stale) {
  const ydoc = new Y.Doc()
  const provider = new HocuspocusProvider({
    url: `ws://127.0.0.1:4319/?token=${env.PADDO_TOKEN}`,
    name: doc.slug,
    document: ydoc,
  })
  await new Promise((resolve) => {
    provider.on('synced', resolve)
    setTimeout(resolve, 5000)
  })
  provider.destroy()
  ydoc.destroy()
  // Give the server time to unload the room and rename the files.
  await new Promise((resolve) => setTimeout(resolve, 4000))
}

const after = await (await fetch(`${ORIGIN}/api/documents`, { headers: { cookie } })).json()
console.log('after:', after.documents.map((doc) => `${doc.slug} (${doc.title})`))
