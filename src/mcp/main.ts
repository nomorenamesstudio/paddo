/**
 * Paddō MCP server — the agent's whole interface to the editor.
 *
 * The agent reads a document, copies text out of it, and sends hunks back as
 * suggestions. It never writes the file, and it never counts character offsets:
 * `original` must be text it copied, and the server anchors it.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

const baseUrl = (process.env.PADDO_URL ?? 'http://127.0.0.1:4319').replace(/\/$/, '')
const token = process.env.PADDO_TOKEN ?? ''

if (!token) {
  console.error('paddo-mcp: PADDO_TOKEN is not set. Export it from Paddō\'s .env before starting the agent.')
  process.exit(1)
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...init.headers,
    },
  })

  const body = await response.text()
  if (!response.ok) {
    throw new Error(`Paddō ${response.status}: ${body || response.statusText}`)
  }
  return (body ? JSON.parse(body) : {}) as T
}

function text(value: unknown): { content: Array<{ type: 'text'; text: string }> } {
  return { content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] }
}

const server = new McpServer({ name: 'paddo', version: '0.1.0' })

server.registerTool(
  'list_documents',
  {
    title: 'List documents',
    description: 'List the markdown documents in Paddō with their slug, title, word count and last edit.',
    inputSchema: {},
  },
  async () => text(await call('/api/documents')),
)

server.registerTool(
  'read_document',
  {
    title: 'Read a document',
    description:
      'Read one document as markdown. This is the text you must quote verbatim when proposing edits.',
    inputSchema: {
      document: z.string().describe('Document slug, as returned by list_documents'),
    },
  },
  async ({ document }) => {
    const body = await call<{ slug: string; title: string; markdown: string }>(
      `/api/documents/${encodeURIComponent(document)}`,
    )
    // The markdown already carries its heading; adding the title again showed up
    // in every quote the agent then copied.
    return text(body.markdown)
  },
)

server.registerTool(
  'propose_edits',
  {
    title: 'Propose edits',
    description:
      'Send small, reviewable changes to a document. Each edit quotes existing text as `original` and gives the replacement as `proposed`. A human accepts or rejects each hunk in the editor. Never rewrite the whole document in one edit; one sentence or phrase per hunk.',
    inputSchema: {
      document: z.string().describe('Document slug'),
      edits: z
        .array(
          z.object({
            original: z
              .string()
              .describe('Text copied verbatim from the document. Sent back unchanged beside the replacement.'),
            proposed: z.string().describe('The replacement text. Empty string deletes the original.'),
            rationale: z.string().optional().describe('Why this change helps. Shown to the reader.'),
          }),
        )
        .min(1)
        .max(30)
        .describe('Hunks, each small enough to judge on a phone screen'),
      rationale: z.string().optional().describe('Optional summary of the run'),
    },
  },
  async ({ document, edits, rationale }) => {
    const result = await call(`/api/documents/${encodeURIComponent(document)}/suggestions`, {
      method: 'POST',
      body: JSON.stringify({ edits, rationale, author: 'agent' }),
    })
    return text(result)
  },
)

server.registerTool(
  'submit_markdown',
  {
    title: 'Submit rewritten markdown',
    description:
      'Fallback for whole-document rewrites: send the complete new markdown and the server diffs it against the live document, turning each changed run into a suggestion. Prefer propose_edits.',
    inputSchema: {
      document: z.string().describe('Document slug'),
      markdown: z.string().describe('The complete rewritten document, in markdown'),
      rationale: z.string().optional().describe('Optional summary of the run'),
    },
  },
  async ({ document, markdown, rationale }) => {
    const result = await call(`/api/documents/${encodeURIComponent(document)}/suggestions`, {
      method: 'POST',
      body: JSON.stringify({ markdown, rationale, author: 'agent' }),
    })
    return text(result)
  },
)

server.registerTool(
  'pending_suggestions',
  {
    title: 'List pending suggestions',
    description: 'What is still waiting for a human decision on this document.',
    inputSchema: {
      document: z.string().describe('Document slug'),
    },
  },
  async ({ document }) =>
    text(await call(`/api/documents/${encodeURIComponent(document)}/suggestions`)),
)

await server.connect(new StdioServerTransport())
