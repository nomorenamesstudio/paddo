import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { Config } from './config'

/** What the writer tells the agent about their own voice. Plain text, not a document. */
export interface Settings {
  writingGuide: string
}

export const EMPTY_SETTINGS: Settings = { writingGuide: '' }

/** Long enough for a real style guide, short enough to paste into a prompt. */
export const MAX_WRITING_GUIDE = 20_000

function settingsPath(config: Config): string {
  return join(config.sidecarDir, 'settings.json')
}

export function normalizeSettings(input: unknown): Settings {
  const raw = (input ?? {}) as { writingGuide?: unknown }
  const writingGuide = typeof raw.writingGuide === 'string' ? raw.writingGuide : ''
  if (writingGuide.length > MAX_WRITING_GUIDE) {
    throw new Error(`writing guide is longer than ${MAX_WRITING_GUIDE} characters`)
  }
  return { writingGuide }
}

export async function readSettings(config: Config): Promise<Settings> {
  try {
    return normalizeSettings(JSON.parse(await readFile(settingsPath(config), 'utf8')))
  } catch {
    // No settings yet, or unreadable ones: start empty rather than refuse to boot.
    return EMPTY_SETTINGS
  }
}

export async function writeSettings(config: Config, settings: Settings): Promise<void> {
  await mkdir(config.sidecarDir, { recursive: true })
  await writeFile(settingsPath(config), `${JSON.stringify(settings, null, 2)}\n`, 'utf8')
}
