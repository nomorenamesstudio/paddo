/**
 * The stdio entry point: for MCP clients that cannot speak HTTP.
 *
 * It is a thin wrapper — the tools themselves live in `src/server/mcp.ts`, because
 * the same set is served remotely at `/mcp` by Paddō's own process.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

import { createAgentServer } from '../server/mcp'

const baseUrl = (process.env.PADDO_URL ?? 'http://127.0.0.1:4319').replace(/\/$/, '')
const token = process.env.PADDO_TOKEN ?? ''

if (!token) {
  console.error('paddo-mcp: PADDO_TOKEN is not set. Mint one in Paddō under Settings → Agent tokens.')
  process.exit(1)
}

const server = createAgentServer({ baseUrl, token })
await server.connect(new StdioServerTransport())
