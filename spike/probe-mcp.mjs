/** End-to-end MCP check: a real stdio client against the real server. */
import { readFile } from 'node:fs/promises'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const ORIGIN = 'http://127.0.0.1:4319'
const slug = 'the-quiet-interface'
const env = Object.fromEntries(
  (await readFile(new URL('../.env', import.meta.url), 'utf8'))
    .split('\n')
    .filter((line) => line.includes('='))
    .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
)

const transport = new StdioClientTransport({
  command: 'npx',
  args: ['tsx', 'src/mcp/main.ts'],
  env: {
    ...process.env,
    PADDO_URL: ORIGIN,
    PADDO_TOKEN: env.PADDO_TOKEN ?? '',
  },
})

const client = new Client({ name: 'paddo-probe', version: '0.0.0' })
await client.connect(transport)

const tools = await client.listTools()
const toolNames = tools.tools.map((tool) => tool.name).sort()

const listed = await client.callTool({ name: 'list_documents', arguments: {} })
const documents = JSON.parse(listed.content?.[0]?.text ?? '[]')

const read = await client.callTool({ name: 'read_document', arguments: { document: slug } })
const markdown = read.content?.[0]?.text ?? ''

const proposed = await client.callTool({
  name: 'propose_edits',
  arguments: {
    document: slug,
    edits: [
      {
        original: 'The rest is mostly restraint.',
        proposed: 'The rest is mostly restraint, and the restraint is the point.',
        rationale: 'Echoes the sentence and lands the section.',
      },
    ],
  },
})
const proposal = JSON.parse(proposed.content?.[0]?.text ?? '{}')

const pending = await client.callTool({ name: 'pending_suggestions', arguments: { document: slug } })
const pendingBody = JSON.parse(pending.content?.[0]?.text ?? '{}')

const badQuote = await client.callTool({
  name: 'propose_edits',
  arguments: {
    document: slug,
    edits: [{ original: 'this text is definitely not in the document', proposed: 'x' }],
  },
})
const badBody = JSON.parse(badQuote.content?.[0]?.text ?? '{}')

console.log(
  JSON.stringify(
    {
      toolNames,
      documentCount: documents.documents?.length ?? 0,
      readStartsWithHeading: markdown.startsWith('# '),
      readLength: markdown.length,
      proposedHunks: proposal.created?.length ?? 0,
      proposeErrors: proposal.errors ?? [],
      pendingCount: pendingBody.suggestions?.length ?? 0,
      badQuoteRefused: badBody.errors?.[0]?.error ?? null,
    },
    null,
    2,
  ),
)

// Clean up what this probe created.
for (const suggestion of pendingBody.suggestions ?? []) {
  await fetch(`${ORIGIN}/api/documents/${slug}/suggestions/${suggestion.id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${env.PADDO_TOKEN}` },
    body: JSON.stringify({ status: 'rejected' }),
  })
}

await client.close()
