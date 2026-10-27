/** My proposal said "colour"; his house spelling is US. Swap that hunk for a corrected one. */
import { readFile } from 'node:fs/promises'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const ORIGIN = 'http://127.0.0.1:4319'
const slug = 'the-quiet-interface'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))

const pending = await fetch(`${ORIGIN}/api/documents/${slug}/suggestions`, {
  headers: { authorization: `Bearer ${env.PADDO_TOKEN}` },
}).then((response) => response.json())

const wrong = pending.suggestions.find((suggestion) => String(suggestion.proposed).includes('colour'))
if (wrong) {
  await fetch(`${ORIGIN}/api/documents/${slug}/suggestions/${wrong.id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${env.PADDO_TOKEN}` },
    body: JSON.stringify({ status: 'rejected' }),
  })
  console.log('dropped the en-GB hunk')
}

const client = new Client({ name: 'paddo-demo-2b', version: '0.0.0' })
await client.connect(
  new StdioClientTransport({
    command: 'npx',
    args: ['tsx', 'src/mcp/main.ts'],
    env: { ...process.env, PADDO_URL: ORIGIN, PADDO_TOKEN: env.PADDO_TOKEN ?? '' },
  }),
)

const propose = await client.callTool({
  name: 'propose_edits',
  arguments: {
    document: slug,
    edits: [
      {
        original: 'a toolbar of forty-seven ways to interrupt yourself, and every one of them is a small invitation to stop thinking about the sentence and start thinking about the formatting',
        proposed:
          'a toolbar of forty-seven ways to interrupt yourself, each one a small invitation to stop thinking about the sentence and start thinking about the formatting: bold, italic, a heading, a color, a list, a divider, a table nobody needs.',
        rationale: 'Names the interruptions instead of asserting them — the list does the arguing.',
      },
    ],
  },
})
console.log(propose.content[0].text)
await client.close()
