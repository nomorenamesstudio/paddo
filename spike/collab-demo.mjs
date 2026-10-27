/** The real thing: an MCP agent proposing edits to the writer's own article. */
import { readFile } from 'node:fs/promises'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const slug = 'wow-this-cool'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))

const client = new Client({ name: 'paddo-demo', version: '0.0.0' })
await client.connect(
  new StdioClientTransport({
    command: 'npx',
    args: ['tsx', 'src/mcp/main.ts'],
    env: { ...process.env, PADDO_URL: 'http://127.0.0.1:4319', PADDO_TOKEN: env.PADDO_TOKEN ?? '' },
  }),
)

const read = await client.callTool({ name: 'read_document', arguments: { document: slug } })
console.log('--- the agent reads ---')
console.log(read.content[0].text)

const propose = await client.callTool({
  name: 'propose_edits',
  arguments: {
    document: slug,
    edits: [
      {
        original: 'Finally this thing might be a cool way to put my thoughts into the system and easy access for my agent too.',
        proposed:
          'Finally, a place to put my thoughts down that my agent can read too — plain markdown on a disk I own, with no database and no sync service standing between me and the sentence.',
        rationale: 'Says what the thing actually is, and drops the “system” abstraction.',
      },
      {
        original: 'Oh yey it works.',
        proposed: 'Oh yes, it works.',
        rationale: 'Spelling.',
      },
      {
        original: 'will see how it turns out.',
        proposed: "We'll see how it turns out.",
        rationale: 'Sentence starts mid-air without a subject.',
      },
    ],
  },
})

const result = JSON.parse(propose.content[0].text)
const pending = JSON.parse(
  (await client.callTool({ name: 'pending_suggestions', arguments: { document: slug } })).content[0].text,
)
console.log('--- created ---')
for (const hunk of result.created) console.log(` ${hunk.kind.padEnd(8)} ${JSON.stringify(hunk.original).slice(0, 52)}`)
console.log('--- errors ---', JSON.stringify(result.errors))
console.log('--- pending now ---', pending.suggestions.length)

await client.close()
