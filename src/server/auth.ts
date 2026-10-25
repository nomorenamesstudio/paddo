import { createHmac, timingSafeEqual } from 'node:crypto'

export const SESSION_COOKIE = 'paddo_session'
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

function hmac(secret: string, value: string): string {
  return createHmac('sha256', secret).update(value).digest('base64url')
}

/** `<expiresAt>.<hmac>` — no session store, no user accounts, one shared password. */
export function createSession(secret: string, now = Date.now()): string {
  const expiresAt = now + SESSION_TTL_MS
  return `${expiresAt}.${hmac(secret, String(expiresAt))}`
}

export function verifySession(secret: string, value: string | undefined, now = Date.now()): boolean {
  if (!value) return false
  const [expiresRaw, signature] = value.split('.')
  if (!expiresRaw || !signature) return false
  const expiresAt = Number(expiresRaw)
  if (!Number.isFinite(expiresAt) || expiresAt < now) return false

  const expected = hmac(secret, expiresRaw)
  const a = Buffer.from(signature)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined
  for (const part of header.split(';')) {
    const index = part.indexOf('=')
    if (index === -1) continue
    if (part.slice(0, index).trim() === name) return decodeURIComponent(part.slice(index + 1).trim())
  }
  return undefined
}

export function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

/**
 * Five wrong passwords a minute per address. In memory on purpose: one process,
 * personal service, a restart is an acceptable reset.
 */
export class LoginThrottle {
  #attempts = new Map<string, { count: number; resetAt: number }>()

  constructor(private readonly limit = 5, private readonly windowMs = 60_000) {}

  allow(key: string, now = Date.now()): boolean {
    const entry = this.#attempts.get(key)
    if (!entry || entry.resetAt < now) {
      this.#attempts.set(key, { count: 1, resetAt: now + this.windowMs })
      return true
    }
    entry.count += 1
    return entry.count <= this.limit
  }

  reset(key: string): void {
    this.#attempts.delete(key)
  }
}
