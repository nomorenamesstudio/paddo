import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { Config } from './config'

/**
 * Old names of renamed documents.
 *
 * A document's file name follows its title, so it changes under the feet of anyone
 * holding the old address — a bookmark, or a phone tab that slept through the rename.
 * Without this map that old address opens an empty room, which then writes a second
 * file with the same title.
 */
type AliasMap = Record<string, string>

function storePath(config: Config): string {
  return join(config.sidecarDir, 'aliases.json')
}

export async function readAliases(config: Config): Promise<AliasMap> {
  try {
    const raw = await readFile(storePath(config), 'utf8')
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    )
  } catch {
    return {}
  }
}

async function writeAliases(config: Config, aliases: AliasMap): Promise<void> {
  await mkdir(config.sidecarDir, { recursive: true })
  const target = storePath(config)
  const temp = `${target}.${process.pid}.tmp`
  await writeFile(temp, `${JSON.stringify(aliases, null, 2)}\n`, 'utf8')
  const { rename } = await import('node:fs/promises')
  await rename(temp, target)
}

/**
 * Records `from → to`, and re-points anything that used to end at `from`, so a
 * document renamed three times still answers to the name it was born with.
 */
export async function rememberAlias(config: Config, from: string, to: string): Promise<void> {
  if (from === to) return
  const aliases = await readAliases(config)
  aliases[from] = to
  for (const [old, current] of Object.entries(aliases)) {
    if (old !== from && current === from) aliases[old] = to
  }
  await writeAliases(config, aliases)
}

/** The name this document has now; the same slug when it was never renamed. */
export async function resolveAlias(config: Config, slug: string): Promise<string> {
  const aliases = await readAliases(config)
  let current = slug
  // A chain cannot be longer than the number of aliases; the cap is for safety.
  for (let hop = 0; hop < 20; hop += 1) {
    const next = aliases[current]
    if (!next || next === current) return current
    current = next
  }
  return current
}
