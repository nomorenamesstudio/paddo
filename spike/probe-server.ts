/**
 * Phase 0 probe: one port for everything.
 *
 * Fastify owns the socket (static files + JSON API), and Hocuspocus shares it
 * by having its `upgrade` listener triggered from Fastify's server. Hocuspocus
 * builds its own http.Server internally, so the question is whether its
 * crossws instance accepts upgrades that never went through that server.
 */
import Fastify from 'fastify'
import { Server as HocuspocusServer } from '@hocuspocus/server'
import { HocuspocusProvider } from '@hocuspocus/provider'
import * as Y from 'yjs'

const PORT = 4399
const TOKEN = 'probe-token'

const fastify = Fastify({ logger: false })
fastify.get('/api/ping', async () => ({ ok: true }))

const hocuspocus = new HocuspocusServer({
  onAuthenticate: async ({ token }) => {
    if (token !== TOKEN) throw new Error('unauthorized')
    return { user: 'probe' }
  },
})

await fastify.listen({ port: PORT, host: '127.0.0.1' })
fastify.server.on('upgrade', (request, socket, head) => {
  hocuspocus.httpServer.emit('upgrade', request, socket, head)
})

function connect(name: string, token = TOKEN) {
  return new Promise<HocuspocusProvider>((resolve, reject) => {
    const provider = new HocuspocusProvider({
      url: `ws://127.0.0.1:${PORT}`,
      name,
      token,
      onSynced: () => resolve(provider),
      onAuthenticationFailed: ({ reason }) => reject(new Error(`auth failed: ${reason}`)),
    })
    setTimeout(() => reject(new Error('timeout syncing')), 4000)
  })
}

const ping = await fetch(`http://127.0.0.1:${PORT}/api/ping`).then((r) => r.json())
console.log('http route works:', ping.ok)

const a = await connect('probe-doc')
const b = await connect('probe-doc')
console.log('both clients synced')

a.document.getText('body').insert(0, 'hello from A')
await new Promise((r) => setTimeout(r, 300))
console.log('B sees the edit:', b.document.getText('body').toString() === 'hello from A')

a.destroy()
b.destroy()

// Auth must actually close the door.
try {
  await connect('probe-doc', 'wrong-token')
  console.log('auth gate: FAILED (wrong token accepted)')
} catch (error) {
  console.log('auth gate rejects wrong token:', (error as Error).message)
}

await fastify.close()
process.exit(0)
