export const THEMES = ['system', 'light', 'dark'] as const
export type Theme = (typeof THEMES)[number]

export const DEFAULT_THEME: Theme = 'system'

const STORAGE_KEY = 'paddo-theme'
const DARK_QUERY = '(prefers-color-scheme: dark)'

export function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value)
}

export function resolveTheme(theme: Theme): 'light' | 'dark' {
  if (theme !== 'system') return theme
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light'
}

export function storedTheme(): Theme {
  const stored = window.localStorage.getItem(STORAGE_KEY)
  return isTheme(stored) ? stored : DEFAULT_THEME
}

/**
 * Applies the resolved theme and remembers the choice for the next first paint.
 * A missing or unknown value falls back to system: writing "undefined" into the
 * dataset would leave the page with no theme at all.
 */
export function applyTheme(value: unknown): void {
  const theme = isTheme(value) ? value : DEFAULT_THEME
  const root = document.documentElement
  root.dataset.theme = resolveTheme(theme)
  root.dataset.themeSetting = theme
  try {
    window.localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // Private mode with storage off: the theme still applies to this session.
  }
}

/** Follows the OS while the setting is "system". Returns an unsubscribe. */
export function watchSystemTheme(getTheme: () => Theme): () => void {
  const media = window.matchMedia(DARK_QUERY)
  const onChange = () => {
    if (getTheme() === 'system') applyTheme('system')
  }
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}
