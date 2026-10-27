/** A rename must produce no suggestions: the CRDT state moves before the markdown. */
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

const pending = async (slug) =>
  (await (await fetch(`${ORIGIN}/api/documents/${slug}/suggestions`, { headers: { cookie } })).json()).suggestions

const stub = 'probe-rename-clean'
await writeFile(`content/${stub}.md`, '# Probe rename\n\nNothing to review here.\n', 'utf8')
await new Promise((resolve) => setTimeout(resolve, 2500))

const client = new Client({ name: 'probe', version: '0.0.0' })
await client.connect(new StdioClientTransport({
  command: 'npx', args: ['tsx', 'src/mcp/main.ts'],
  env: { ...process.env, PADDO_URL: ORIGIN, PADDO_TOKEN: env.PADDO_TOKEN ?? '' },
}))
await client.callTool({ name: 'read_document', arguments: { document: stub } })
await new Promise((resolve) => setTimeout(resolve, 2500))
const before = await pending(stub)

await rename(`.paddo/${stub}.y`, '.paddo/probe-rename-clean-renamed.y')
await rename(`content/${stub}.md`, 'content/probe-rename-clean-renamed.md')
await new Promise((resolve) => setTimeout(resolve, 3500))
const afterRename = await pending('probe-rename-clean-renamed')

console.log(JSON.stringify({ before: before.length, afterRename: afterRename.length }, null, 2))
await fetch(`${ORIGIN}/api/documents/probe-rename-clean-renamed`, { method: 'DELETE', headers: { cookie } })
await client.close()
