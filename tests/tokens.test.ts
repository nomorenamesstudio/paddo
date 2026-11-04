import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import type { Config } from '../src/server/config'
import {
  allows,
  grantDocument,
  listTokens,
  mintToken,
  normalizeMint,
  revokeToken,
  verifyToken,
} from '../src/server/tokens'

async function testConfig(): Promise<Config> {
  const root = await mkdtemp(join(tmpdir(), 'paddo-tokens-'))
  return {
    host: '127.0.0.1',
    port: 0,
    contentDir: join(root, 'content'),
    sidecarDir: join(root, '.paddo'),
    password: 'password',
    secret: 'secret-that-is-long-enough-for-the-config-loader',
    token: 'token-that-is-long-enough-for-the-config-loader',
    trustProxy: false,
  }
}

describe('agent tokens', () => {
  it('authenticates with the secret it returned once, and stores only its hash', async () => {
    const config = await testConfig()
    const { token, secret } = await mintToken(config, {
      name: 'case studies',
      verbs: ['read', 'propose'],
      documents: ['the-quiet-interface'],
    })

    const stored = await readFile(join(config.sidecarDir, 'tokens.json'), 'utf8')
    expect(stored).not.toContain(secret)
    expect(token.id).toMatch(/^tok_/)

    const verified = await verifyToken(config, secret)
    expect(verified?.id).toBe(token.id)
    expect(await verifyToken(config, 'paddo_not-a-real-secret')).toBeNull()
    // A token that does not carry our prefix never touches the store.
    expect(await verifyToken(config, config.token)).toBeNull()
  })

  it('lets a token through only for the verbs and documents it holds', async () => {
    const config = await testConfig()
    const { secret } = await mintToken(config, {
      name: 'scoped',
      verbs: ['read'],
      documents: ['one', 'two'],
    })
    const token = (await verifyToken(config, secret))!

    expect(allows(token, 'read', 'one')).toBe(true)
    expect(allows(token, 'propose', 'one')).toBe(false)
    expect(allows(token, 'read', 'three')).toBe(false)
  })

  it('treats "*" as the whole library, for every verb it holds', async () => {
    const config = await testConfig()
    const { secret } = await mintToken(config, { name: 'all', verbs: ['read', 'create'], documents: '*' })
    const token = (await verifyToken(config, secret))!

    expect(allows(token, 'read', 'anything-at-all')).toBe(true)
    expect(allows(token, 'create', 'anything-at-all')).toBe(true)
    expect(allows(token, 'propose', 'anything-at-all')).toBe(false)
  })

  it('adds a created document to the token that created it, once', async () => {
    const config = await testConfig()
    const { token } = await mintToken(config, {
      name: 'creator',
      verbs: ['read', 'create'],
      documents: ['seed'],
    })

    await grantDocument(config, token.id, 'dropped-in')
    await grantDocument(config, token.id, 'dropped-in')

    const [stored] = await listTokens(config)
    expect(stored?.documents).toEqual(['seed', 'dropped-in'])
  })

  it('revoking leaves the token unusable and drops it from the list', async () => {
    const config = await testConfig()
    const { token, secret } = await mintToken(config, {
      name: 'temporary',
      verbs: ['read'],
      documents: '*',
    })

    expect(await revokeToken(config, token.id)).toBe(true)
    expect(await revokeToken(config, token.id)).toBe(false)
    expect(await verifyToken(config, secret)).toBeNull()
    expect(await listTokens(config)).toEqual([])
  })

  it('refuses a mint request that would reach nothing or name nothing', () => {
    expect(() => normalizeMint({ verbs: ['read'], documents: '*' })).toThrow(/needs a name/)
    expect(() => normalizeMint({ name: 'x', verbs: [], documents: '*' })).toThrow(/at least one permission/)
    expect(() => normalizeMint({ name: 'x', verbs: ['read'], documents: [] })).toThrow(
      /at least one document/,
    )
    expect(() => normalizeMint({ name: 'x', verbs: ['read'], documents: ['Not A Slug'] })).toThrow(
      /invalid document name/,
    )
    // Unknown verbs are dropped rather than trusted.
    expect(normalizeMint({ name: 'x', verbs: ['read', 'destroy'], documents: '*' }).verbs).toEqual([
      'read',
    ])
    expect(normalizeMint({ name: 'x', verbs: ['read'], documents: ['b', 'a', 'b'] }).documents).toEqual([
      'b',
      'a',
    ])
  })
})
