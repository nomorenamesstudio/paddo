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
provider.on('status', ({ status }) => console.log('status', status))
provider.on('authenticationFailed', ({ reason }) => console.log('auth failed', reason))
provider.on('synced', () => console.log('synced, fragment length', doc.getXmlFragment('content').length))
setTimeout(() => { provider.destroy(); process.exit(0) }, 5000)
