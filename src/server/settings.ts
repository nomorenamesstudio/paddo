import { randomBytes } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { Config } from './config'

export const THEMES = ['system', 'light', 'dark'] as const
export type Theme = (typeof THEMES)[number]

/** What the writer tells the agent about their own voice, and how they want to read. */
export interface Settings {
  writingGuide: string
  theme: Theme
}

export const EMPTY_SETTINGS: Settings = { writingGuide: '', theme: 'system' }

function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value)
}

/** Long enough for a real style guide, short enough to paste into a prompt. */
export const MAX_WRITING_GUIDE = 20_000

function settingsPath(config: Config): string {
  return join(config.sidecarDir, 'settings.json')
}

export function normalizeSettings(input: unknown): Settings {
  const raw = (input ?? {}) as { writingGuide?: unknown; theme?: unknown }
  const writingGuide = typeof raw.writingGuide === 'string' ? raw.writingGuide : ''
  if (writingGuide.length > MAX_WRITING_GUIDE) {
    throw new Error(`writing guide is longer than ${MAX_WRITING_GUIDE} characters`)
  }
  return { writingGuide, theme: isTheme(raw.theme) ? raw.theme : 'system' }
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
  const target = settingsPath(config)
  // Temp and rename: written in place, a crash mid-write truncated the file, and the
  // reader treats unreadable settings as empty — which silently lost the guide.
  const temp = `${target}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`
  await writeFile(temp, `${JSON.stringify(settings, null, 2)}\n`, 'utf8')
  await rename(temp, target)
}
