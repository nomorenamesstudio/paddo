/** The same collab run, on the other test article. */
import { readFile } from 'node:fs/promises'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const slug = 'the-quiet-interface'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))

const client = new Client({ name: 'paddo-demo-2', version: '0.0.0' })
await client.connect(
  new StdioClientTransport({
    command: 'npx',
    args: ['tsx', 'src/mcp/main.ts'],
    env: { ...process.env, PADDO_URL: 'http://127.0.0.1:4319', PADDO_TOKEN: env.PADDO_TOKEN ?? '' },
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
          'a toolbar of forty-seven ways to interrupt yourself, each one a small invitation to stop thinking about the sentence and start thinking about the formatting: bold, italic, a heading, a colour, a list, a divider, a table nobody needs.',
        rationale: 'Names the interruptions instead of asserting them — the list does the arguing.',
      },
      {
        original: 'Headers are doors.',
        proposed: 'Headings are doors.',
        rationale: 'The rest of the piece says headings; only this sentence says headers.',
      },
      {
        original:
          'What the tools should do, then, is hold the document steady while the thinking moves. Sync in the background.',
        proposed: 'What the tools should do, then, is hold the document steady while the thinking moves.',
        rationale: 'Cuts the fragment that the blockquote below already makes.',
      },
    ],
  },
})

const result = JSON.parse(propose.content[0].text)
const pending = JSON.parse(
  (await client.callTool({ name: 'pending_suggestions', arguments: { document: slug } })).content[0].text,
)
console.log('--- created ---')
for (const hunk of result.created) console.log(` ${hunk.kind.padEnd(8)} ${JSON.stringify(hunk.original).slice(0, 60)}`)
console.log('--- errors ---', JSON.stringify(result.errors))
console.log('--- pending ---', pending.suggestions.length)
await client.close()
