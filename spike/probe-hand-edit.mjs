/**
 * Two contracts: a hand edit of a .md still becomes a suggestion, and a rename
 * (file appearing under a name that already has CRDT state) produces nothing.
 */
import { readFile, rename, writeFile } from 'node:fs/promises'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const env = Object.fromEntries((await readFile('.env', 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const ORIGIN = 'http://127.0.0.1:4319'
const login = await fetch(`${ORIGIN}/api/login`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ password: env.PADDO_PASSWORD }),
})
const cookie = login.headers.get('set-cookie')?.split(';')[0] ?? ''
const token = env.PADDO_TOKEN ?? ''

const list = async () =>
  (await (await fetch(`${ORIGIN}/api/documents`, { headers: { cookie } })).json()).documents
const pending = async (slug) =>
  (await (await fetch(`${ORIGIN}/api/documents/${slug}/suggestions`, { headers: { authorization: `Bearer ${token}` } })).json()).suggestions

// A throwaway document, opened once so it has CRDT state.
const stub = 'probe-hand-edit'
await writeFile(`content/${stub}.md`, '# Probe hand edit\n\nOne sentence here.\n', 'utf8')
const client = new Client({ name: 'probe', version: '0.0.0' })
await client.connect(new StdioClientTransport({
  command: 'npx', args: ['tsx', 'src/mcp/main.ts'],
  env: { ...process.env, PADDO_URL: ORIGIN, PADDO_TOKEN: token },
}))
await client.callTool({ name: 'read_document', arguments: { document: stub } })
await new Promise((resolve) => setTimeout(resolve, 2500))
const seeded = await pending(stub)

// 1. A hand edit becomes a suggestion.
await writeFile(`content/${stub}.md`, '# Probe hand edit\n\nOne sentence here, edited by hand.\n', 'utf8')
await new Promise((resolve) => setTimeout(resolve, 3000))
const afterEdit = await pending(stub)

// 2. A rename produces nothing: same bytes, new name, sidecar moved with it.
await rename(`content/${stub}.md`, 'content/probe-hand-edit-renamed.md')
await rename(`.paddo/${stub}.y`, '.paddo/probe-hand-edit-renamed.y').catch(() => {})
await new Promise((resolve) => setTimeout(resolve, 3000))
const afterRename = await pending('probe-hand-edit-renamed')

console.log(JSON.stringify({
  seeded: seeded.length,
  afterEdit: afterEdit.map((s) => ({ original: s.original, proposed: s.proposed })),
  afterRename: afterRename.length,
}, null, 2))

// Clean up.
await fetch(`${ORIGIN}/api/documents/probe-hand-edit`, { method: 'DELETE', headers: { cookie } })
await fetch(`${ORIGIN}/api/documents/probe-hand-edit-renamed`, { method: 'DELETE', headers: { cookie } })
await client.close()
