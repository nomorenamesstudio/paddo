/**
 * The agent's view of Paddō, as MCP tools.
 *
 * One factory, two transports: the server exposes it at `/mcp` (streamable HTTP,
 * so a Docker install needs nothing else installed), and `pnpm mcp` runs it over
 * stdio for clients that cannot do HTTP.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

// The version comes from package.json so the MCP handshake cannot drift from the
// release the image was built from (it said 0.2.0 while package.json said 0.0.0).
import packageJson from '../../package.json' with { type: 'json' }

/** How the tools reach the API: the server's own origin, and the caller's token. */
export interface AgentClient {
  baseUrl: string
  token: string
}

export async function callAgent<T>(client: AgentClient, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${client.baseUrl}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${client.token}`,
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

export function createAgentServer(client: AgentClient): McpServer {
  const call = <T,>(path: string, init: RequestInit = {}) => callAgent<T>(client, path, init)
  const server = new McpServer({ name: 'paddo', version: packageJson.version })

server.registerTool(
  'list_documents',
  {
    title: 'List documents',
    description: 'List the markdown documents in Paddō with their slug, title, word count and last edit.',
    inputSchema: {},
  },
  async () => text(await call<unknown>('/api/documents')),
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
    // in every quote the agent then copied. `original` is matched against the text
    // itself, so the markers have to be called out — an agent that copies
    // `**bold**` gets a refusal it cannot explain.
    return text(
      `${body.markdown}\n---\nQuote from the text only: markdown markers (#, >, **, _, \`backticks\`, [link](url)) are formatting, not text, and must be left out of \`original\`.`,
    )
  },
)

server.registerTool(
  'get_writing_guide',
  {
    title: 'Read the writing guide',
    description:
      'The writer\'s own rules for voice, tone and formatting. Read it before proposing edits: it is the difference between a change that sounds like them and one that sounds like you.',
    inputSchema: {},
  },
  async () => text(await call<unknown>('/api/settings/guide')),
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
    const result = await call<unknown>(`/api/documents/${encodeURIComponent(document)}/suggestions`, {
      method: 'POST',
      body: JSON.stringify({ edits, rationale, author: 'agent' }),
    })
    return text(result)
  },
)

server.registerTool(
  'create_document',
  {
    title: 'Create a document',
    description:
      'Drop a new markdown document into Paddō. The heading in the markdown names it. Fails if a document with that name already exists — it never overwrites. Use this to hand a draft to the writer; edits to it afterwards go through propose_edits.',
    inputSchema: {
      markdown: z.string().describe('The complete document in markdown, starting with its # heading'),
      name: z.string().optional().describe('Fallback name when the markdown has no heading'),
    },
  },
  async ({ markdown, name }) => {
    const result = await call<unknown>('/api/documents', {
      method: 'POST',
      body: JSON.stringify({ markdown, name }),
    })
    return text(result)
  },
)

server.registerTool(
  'export_document',
  {
    title: 'Export a document',
    description:
      'The document exactly as it stands on disk, with no commentary: what the writer sees in the editor, ready to save into a site or a repo. Pending suggestions are not included.',
    inputSchema: {
      document: z.string().describe('Document slug'),
    },
  },
  async ({ document }) => {
    const response = await fetch(`${client.baseUrl}/api/documents/${encodeURIComponent(document)}/raw`, {
      headers: { authorization: `Bearer ${client.token}` },
    })
    if (!response.ok) {
      throw new Error(`Paddō ${response.status}: ${await response.text()}`)
    }
    return text(await response.text())
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
    const result = await call<unknown>(`/api/documents/${encodeURIComponent(document)}/suggestions`, {
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
    text(await call<unknown>(`/api/documents/${encodeURIComponent(document)}/suggestions`)),
)


  return server
}
