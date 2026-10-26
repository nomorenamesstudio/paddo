import { readFile } from 'node:fs/promises'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const client = new Client({ name: 'paddo-demo-4b', version: '0.0.0' })
await client.connect(new StdioClientTransport({
  command: 'npx', args: ['tsx', 'src/mcp/main.ts'],
  env: { ...process.env, PADDO_URL: 'http://127.0.0.1:4319', PADDO_TOKEN: env.PADDO_TOKEN ?? '' },
}))
const result = JSON.parse((await client.callTool({
  name: 'propose_edits',
  arguments: {
    document: 'new-draft-6',
    edits: [{
      original: 'The Ghosted Story',
      proposed: 'The Ghosted Story',
      rationale: 'Bold inside a heading is redundant, and the asterisks leak into the document title.',
    }],
  },
})).content[0].text)
console.log(JSON.stringify(result.created.map((hunk) => hunk.original), null, 2), JSON.stringify(result.errors))
await client.close()
