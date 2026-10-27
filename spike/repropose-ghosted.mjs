/** Re-proposes the five edits on The Ghosted Story, now that the text is back to his. */
import { readFile } from 'node:fs/promises'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const slug = 'new-draft-6'
const ORIGIN = 'http://127.0.0.1:4319'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))

const client = new Client({ name: 'paddo-ghosted-repropose', version: '0.0.0' })
await client.connect(
  new StdioClientTransport({
    command: 'npx',
    args: ['tsx', 'src/mcp/main.ts'],
    env: { ...process.env, PADDO_URL: ORIGIN, PADDO_TOKEN: env.PADDO_TOKEN ?? '' },
  }),
)

const result = JSON.parse(
  (
    await client.callTool({
      name: 'propose_edits',
      arguments: {
        document: slug,
        edits: [
          {
            original:
              'I knew I’m gonna need some kind of organised way of keeping log on where, when and how I did apply.',
            proposed:
              'I knew I’d need some kind of organised way to keep a log of where, when and how I applied.',
            rationale: 'Tense clashes with “knew”, and “keeping log” is missing its article.',
          },
          {
            original: 'So the idea has borne fruit a few months ago.',
            proposed: 'So the idea became an app a few months ago.',
            rationale: '“Has borne fruit … a few months ago” mixes tenses. Plainer, too.',
          },
          {
            original:
              'During the time I was building the app organically based on what I felt missing or blocking me while logging my countless job applications.',
            proposed:
              'I built the app organically, based on whatever felt missing or blocked me while logging applications.',
            rationale: 'The sentence has a “during” clause and no main verb.',
          },
          {
            original:
              'It has to be free of charge because I can’t imagine more disgusting than ripping off actual unemployed people in today’s job market.',
            proposed:
              'It has to be free, because I can’t imagine anything more disgusting than ripping off unemployed people in this job market.',
            rationale: '“Anything” was missing, and the guide asks for direct — so “free”, not “free of charge”.',
          },
          {
            original: 'share with them please.',
            proposed: 'share it with them, please.',
            rationale: 'Missing object: you share the app, not the person.',
          },
        ],
      },
    })
  ).content[0].text,
)

const pending = JSON.parse(
  (await client.callTool({ name: 'pending_suggestions', arguments: { document: slug } })).content[0].text,
)
console.log('created:', result.created.length, '| errors:', JSON.stringify(result.errors), '| pending:', pending.suggestions.length)
await client.close()
