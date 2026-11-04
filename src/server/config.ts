import { resolve } from 'node:path'

export interface Config {
  host: string
  port: number
  contentDir: string
  sidecarDir: string
  password: string
  secret: string
  token: string
  /**
   * Behind a reverse proxy, `request.ip` is the proxy unless this is on — which
   * turns the login throttle into one bucket shared by every client. Off by
   * default: trusted blindly, it lets anyone spoof `X-Forwarded-For` and dodge
   * that throttle instead.
   */
  trustProxy: boolean
}

/**
 * Fails loudly instead of starting an unauthenticated service on the LAN.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const missing: string[] = []
  const read = (name: string): string => {
    const value = env[name]?.trim()
    if (!value) missing.push(name)
    return value ?? ''
  }

  const config: Config = {
    host: env.PADDO_HOST?.trim() || '0.0.0.0',
    port: Number(env.PADDO_PORT ?? 4319),
    contentDir: resolve(env.PADDO_CONTENT_DIR?.trim() || 'content'),
    sidecarDir: resolve(env.PADDO_SIDECAR_DIR?.trim() || '.paddo'),
    password: read('PADDO_PASSWORD'),
    secret: read('PADDO_SECRET'),
    token: read('PADDO_TOKEN'),
    trustProxy: env.PADDO_TRUST_PROXY?.trim() === 'true',
  }

  if (missing.length > 0) {
    throw new Error(`missing required environment: ${missing.join(', ')} — see .env.example`)
  }
  if (config.secret.length < 32) {
    throw new Error('PADDO_SECRET must be at least 32 characters; generate one with: openssl rand -hex 32')
  }
  if (config.token.length < 32) {
    throw new Error('PADDO_TOKEN must be at least 32 characters; generate one with: openssl rand -hex 32')
  }
  if (!Number.isInteger(config.port) || config.port <= 0 || config.port > 65535) {
    throw new Error(`PADDO_PORT is not a valid port: ${env.PADDO_PORT}`)
  }

  return config
}
