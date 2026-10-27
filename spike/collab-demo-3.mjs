/** The collab run on his "Another test article" — the one written to test the agent. */
import { readFile } from 'node:fs/promises'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const slug = 'new-draft-5'
const ORIGIN = 'http://127.0.0.1:4319'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))

const client = new Client({ name: 'paddo-demo-3', version: '0.0.0' })
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
        original:
          'I hope this tool will help to write smoother not this bs with copy-paste between devices and apps.',
        proposed:
          'I hope this tool makes writing smoother than this bs of copy-pasting between devices and apps.',
        rationale: 'The sentence loses its grammar halfway; same voice, one clause.',
      },
      {
        original: 'Actually do a testing round with and agent.',
        proposed: 'Actually, do a testing round with an agent.',
        rationale: 'Typo: “and agent” should be “an agent”.',
      },
      {
        original:
          'An orange is blue, just to see if it catches it as nonsense. Or it will catch it exactly because i wrote it down as nonsense?',
        proposed:
          'An orange is blue — I wrote that to see whether an agent catches nonsense on its own, or only catches what it has already been told is nonsense.',
        rationale:
          'Keeps your test, sharpens the question, and gives the second sentence its missing subject.',
      },
      {
        original: 'But for sure i have to get used to not to hit double enter for the next paragraph lol.',
        proposed: "But I'll have to get used to not hitting enter twice for the next paragraph, lol.",
        rationale: 'Capital I, and “not to hit” becomes “not hitting”.',
      },
    ],
  },
})

const result = JSON.parse(propose.content[0].text)
console.log('--- created ---')
for (const hunk of result.created) console.log(` ${hunk.kind.padEnd(8)} ${JSON.stringify(hunk.original).slice(0, 64)}`)
console.log('--- errors ---', JSON.stringify(result.errors))
await client.close()
