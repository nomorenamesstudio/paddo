import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { readAliases, rememberAlias, resolveAlias } from '../src/server/aliases'
import type { Config } from '../src/server/config'

async function testConfig(): Promise<Config> {
  const root = await mkdtemp(join(tmpdir(), 'paddo-aliases-'))
  return {
    host: '127.0.0.1',
    port: 0,
    contentDir: join(root, 'content'),
    sidecarDir: join(root, '.paddo'),
    password: 'password',
    secret: 'secret-that-is-long-enough-for-the-config-loader',
    token: 'token-that-is-long-enough-for-the-config-loader',
  }
}

describe('renamed documents keep answering to their old names', () => {
  it('resolves a single hop, and leaves an untouched name alone', async () => {
    const config = await testConfig()
    await rememberAlias(config, 'new-draft-3', 'linkedin-post-ideas-2')

    expect(await resolveAlias(config, 'new-draft-3')).toBe('linkedin-post-ideas-2')
    expect(await resolveAlias(config, 'never-renamed')).toBe('never-renamed')
  })

  it('follows a chain when a document is renamed more than once', async () => {
    const config = await testConfig()
    await rememberAlias(config, 'new-draft', 'new-draft-2')
    await rememberAlias(config, 'new-draft-2', 'linkedin-post-ideas')
    await rememberAlias(config, 'linkedin-post-ideas', 'linkedin-post-ideas-3')

    // The name it was born with still lands on the current file.
    expect(await resolveAlias(config, 'new-draft')).toBe('linkedin-post-ideas-3')
    expect(await resolveAlias(config, 'new-draft-2')).toBe('linkedin-post-ideas-3')
    expect(await resolveAlias(config, 'linkedin-post-ideas')).toBe('linkedin-post-ideas-3')
  })

  it('re-points the older names when a document is renamed again', async () => {
    const config = await testConfig()
    await rememberAlias(config, 'first', 'second')
    await rememberAlias(config, 'second', 'third')

    const aliases = await readAliases(config)
    expect(aliases.first).toBe('third')
    expect(aliases.second).toBe('third')
  })

  it('does not loop on a name that maps to itself', async () => {
    const config = await testConfig()
    await rememberAlias(config, 'same', 'same')
    expect(await resolveAlias(config, 'same')).toBe('same')
  })
})
