/**
 * Agent run on The Ghosted Story, with the writing guide injected: every hunk has to
 * obey the guide (contractions, no banned words, direct, no fragments).
 */
import { readFile } from 'node:fs/promises'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const slug = 'new-draft-6'
const ORIGIN = 'http://127.0.0.1:4319'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))

const client = new Client({ name: 'paddo-demo-4', version: '0.0.0' })
await client.connect(
  new StdioClientTransport({
    command: 'npx',
    args: ['tsx', 'src/mcp/main.ts'],
    env: { ...process.env, PADDO_URL: ORIGIN, PADDO_TOKEN: env.PADDO_TOKEN ?? '' },
  }),
)

const settings = await fetch(`${ORIGIN}/api/settings`, {
  headers: { authorization: `Bearer ${env.PADDO_TOKEN}` },
}).then((response) => response.json())
const guide = String(settings.writingGuide)
console.log('--- guide injected ---', guide.length, 'chars')

const markdown = (
  await client.callTool({ name: 'read_document', arguments: { document: slug } })
).content[0].text

// Quotes are sliced out of the document itself, so every one is byte-exact.
const quote = (needle) => {
  const at = markdown.indexOf(needle)
  if (at === -1) throw new Error(`not in the document: ${needle.slice(0, 40)}`)
  return needle
}

const edits = [
  {
    original: quote('# **The Ghosted Story**'),
    proposed: '# The Ghosted Story',
    rationale: 'The bold is redundant inside a heading, and the asterisks leak into the title.',
  },
  {
    original: quote('I knew I’m gonna need some kind of organised way of keeping log on where, when and how I did apply.'),
    proposed:
      'I knew I’d need some kind of organised way to keep a log of where, when and how I applied.',
    rationale: 'Tense clashes with “knew”, and “keeping log” is missing its article.',
  },
  {
    original: quote('So the idea has borne fruit a few months ago.'),
    proposed: 'So the idea became an app a few months ago.',
    rationale: '“Has borne fruit … a few months ago” mixes tenses. Plainer, too.',
  },
  {
    original: quote(
      'During the time I was building the app organically based on what I felt missing or blocking me while logging my countless job applications.',
    ),
    proposed:
      'I built the app organically, based on whatever felt missing or blocked me while logging applications.',
    rationale: 'The sentence has a “during” clause and no main verb.',
  },
  {
    original: quote(
      'It has to be free of charge because I can’t imagine more disgusting than ripping off actual unemployed people in today’s job market.',
    ),
    proposed:
      'It has to be free, because I can’t imagine anything more disgusting than ripping off unemployed people in this job market.',
    rationale: '“Anything” was missing, and the guide asks for direct — so “free”, not “free of charge”.',
  },
  {
    original: quote('share with them please.'),
    proposed: 'share it with them, please.',
    rationale: 'Missing object: you share the app, not the person.',
  },
]

const result = JSON.parse(
  (
    await client.callTool({
      name: 'propose_edits',
      arguments: { document: slug, edits },
    })
  ).content[0].text,
)

// Did the edits themselves obey the guide?
const banned = [...guide.matchAll(/\| "?([a-z][a-z' ]{2,})"? \|/g)]
  .map((match) => match[1])
  .filter((word) => word && !word.includes(' ') === false ? word : word)
const bannedWords = [
  'delve', 'tapestry', 'leverage', 'synergy', 'seamless', 'seamlessly', 'robust',
  'utilize', 'facilitate', 'optimize', 'spearheaded', 'orchestrated', 'pioneered',
  'game-changer', 'cutting-edge', 'state-of-the-art', 'passionate about', 'results-driven',
  'detail-oriented',
]
const violations = edits
  .map((edit) => ({
    proposed: edit.proposed,
    hits: bannedWords.filter((word) => edit.proposed.toLowerCase().includes(word)),
  }))
  .filter((entry) => entry.hits.length > 0)

const contractions = edits.filter((edit) => /’(s|t|d|ll|re|ve|m)\b/.test(edit.proposed)).length

console.log('--- created ---')
for (const hunk of result.created) {
  console.log(` ${hunk.kind.padEnd(8)} ${JSON.stringify(hunk.original).slice(0, 58)}`)
}
console.log('--- errors ---', JSON.stringify(result.errors))
console.log('--- guide check ---', JSON.stringify({ violations, hunksWithContractions: contractions }))

await client.close()
