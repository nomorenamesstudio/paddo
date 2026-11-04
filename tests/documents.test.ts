import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { plainTitle, renameDocument, titleOf } from '../src/server/documents'

describe('titleOf', () => {
  it('gives the reader the words, not the markup', () => {
    // A heading written with bold showed up in the library as "**The Ghosted Story**".
    expect(titleOf('# **The Ghosted Story**\n\nBody.\n', 'new-draft-6')).toBe('The Ghosted Story')
    expect(titleOf('# _Draft_ notes\n', 'slug')).toBe('Draft notes')
    expect(titleOf('# See [the notes](https://example.com) now\n', 'slug')).toBe('See the notes now')
    expect(titleOf('Journal\n\nBody.\n', 'slug')).toBe('Journal')
  })

  it('falls back to the slug when there is nothing to read', () => {
    expect(titleOf('', 'new-draft')).toBe('new-draft')
    expect(titleOf('#   \n', 'new-draft')).toBe('new-draft')
  })

  it('leaves an ordinary title alone', () => {
    expect(plainTitle('The quiet interface')).toBe('The quiet interface')
    expect(plainTitle('Two *words* and a `term`')).toBe('Two words and a term')
  })
})

describe('renaming never destroys the document already there', () => {
  it('refuses a target that exists, and leaves both documents intact', async () => {
    const root = await mkdtemp(join(tmpdir(), 'paddo-rename-'))
    const config = {
      host: '127.0.0.1',
      port: 0,
      contentDir: join(root, 'content'),
      sidecarDir: join(root, '.paddo'),
      password: 'password',
      secret: 'secret-that-is-long-enough-for-the-config-loader',
      token: 'token-that-is-long-enough-for-the-config-loader',
      trustProxy: false,
    }
    await mkdir(config.contentDir, { recursive: true })
    await writeFile(join(config.contentDir, 'one.md'), '# One\n\nfirst\n', 'utf8')
    await writeFile(join(config.contentDir, 'two.md'), '# Two\n\nsecond\n', 'utf8')

    // Two documents that share a title pick the same free slug within milliseconds;
    // the loser must fail, not overwrite.
    await expect(renameDocument(config, 'one', 'two')).rejects.toThrow(/already exists/)

    expect(await readFile(join(config.contentDir, 'one.md'), 'utf8')).toContain('first')
    expect(await readFile(join(config.contentDir, 'two.md'), 'utf8')).toContain('second')
  })
})
