/**
 * An agent's-eye test run: a real MCP client over stdio, doing what the invite
 * prompt tells it to do on a test article.
 */
import { readFile } from 'node:fs/promises'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const ORIGIN = 'http://127.0.0.1:4319'
const slug = 'agent-test'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))

const client = new Client({ name: 'paddo-agent-run', version: '0.0.0' })
await client.connect(
  new StdioClientTransport({
    command: 'npx',
    args: ['tsx', 'src/mcp/main.ts'],
    env: { ...process.env, PADDO_URL: ORIGIN, PADDO_TOKEN: env.PADDO_TOKEN ?? '' },
  }),
)

const tools = (await client.listTools()).tools.map((tool) => tool.name).sort()
const read = await client.callTool({ name: 'read_document', arguments: { document: slug } })
const markdown = read.content[0].text
console.log('--- what the agent reads ---')
console.log(markdown)

const propose = await client.callTool({
  name: 'propose_edits',
  arguments: {
    document: slug,
    edits: [
      {
        original:
          'There is a very, very long sentence that goes on and on and does not really need all of these words to make the point it is trying to make, which is that drafts get better when someone cuts them.',
        proposed: 'A long sentence usually means the point is not yet clear. Drafts get better when someone cuts them.',
        rationale: 'Halves the sentence and puts the claim first.',
      },
      {
        original: 'A second pair of eyes sees the flab, the repeated word, the clause that was only there to reassure the writer.',
        proposed:
          'A second pair of eyes sees the flab, the repeated word, the clause that was only there to reassure the writer — and can say so without flinching.',
        rationale: 'Ends on the useful part: someone willing to say it.',
      },
      {
        original: 'This paragraph is here to be deleted. It adds nothing at all and everyone knows it.\n\n',
        proposed: '',
        rationale: 'Deletes the filler paragraph outright.',
      },
      {
        original: 'This text is not in the article.',
        proposed: 'x',
        rationale: 'Should be refused, to prove the guard works.',
      },
    ],
  },
})

const result = JSON.parse(propose.content[0].text)
const pending = JSON.parse(
  (await client.callTool({ name: 'pending_suggestions', arguments: { document: slug } })).content[0].text,
)

console.log('--- tools ---', tools.join(', '))
console.log('--- proposed ---', JSON.stringify(result.created.map((c) => ({ kind: c.kind, rationale: c.rationale })), null, 2))
console.log('--- refused ---', JSON.stringify(result.errors))
console.log('--- pending ---', pending.suggestions.length)

await client.close()
