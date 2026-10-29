import { useEffect, useState } from 'react'
import { Check, Monitor, Moon, Sun } from 'lucide-react'

import { api, ApiError, type Settings } from '../api'
import { AgentTokens } from '../components/AgentTokens'
import { TopBar } from '../components/TopBar'
import { applyTheme, THEMES, type Theme } from '../theme'

const PLACEHOLDER = `How you want the agent to write. Voice, tone, the words you hate, the ones you keep.

Example: Be direct. Use contractions. Vary sentence length. Have opinions. No corporate speak.`

const THEME_LABELS: Record<Theme, string> = { system: 'System', light: 'Light', dark: 'Dark' }

function ThemeIcon({ theme }: { theme: Theme }) {
  if (theme === 'light') return <Sun size={16} aria-hidden="true" />
  if (theme === 'dark') return <Moon size={16} aria-hidden="true" />
  return <Monitor size={16} aria-hidden="true" />
}

export function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    api
      .getSettings()
      .then((loaded) => {
        if (cancelled) return
        setSettings(loaded)
        applyTheme(loaded.theme)
      })
      .catch((problem: unknown) => {
        if (cancelled) return
        setError(problem instanceof ApiError ? problem.message : 'could not load settings')
        setSettings({ writingGuide: '', theme: 'system' })
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function persist(next: Settings) {
    setSaving(true)
    setError(null)
    try {
      const stored = await api.saveSettings(next)
      setSettings(stored)
      setSaved(new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }))
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : 'could not save settings')
      setSettings(settings)
    } finally {
      setSaving(false)
    }
  }

  /** The theme takes effect on click — waiting for a Save button would feel broken. */
  function pickTheme(theme: Theme) {
    if (!settings || settings.theme === theme) return
    applyTheme(theme)
    setSettings({ ...settings, theme })
    void persist({ ...settings, theme })
  }

  const guide = settings?.writingGuide ?? null
  const words = guide === null ? 0 : guide.trim() ? guide.trim().split(/\s+/).length : 0

  return (
    <>
      <TopBar title="Settings" sync="connected" actions={<span className="topbar__actions" />} />

      <main className="page page--narrow settings">
        <p className="muted settings__intro">
          How Paddō looks, how the agent should write, and which agents can reach your work.
        </p>

        <section className="settings__card">
          <h2 className="settings__heading">Appearance</h2>
          <p className="muted settings__note">
            System follows your device, which is usually what you want — dark at night, paper in
            daylight.
          </p>

          <div className="settings__themes" role="radiogroup" aria-label="Theme">
            {THEMES.map((theme) => (
              <button
                key={theme}
                type="button"
                role="radio"
                aria-checked={settings?.theme === theme}
                className={`settings__theme${settings?.theme === theme ? ' is-active' : ''}`}
                onClick={() => pickTheme(theme)}
                disabled={!settings}
              >
                <ThemeIcon theme={theme} />
                {THEME_LABELS[theme]}
              </button>
            ))}
          </div>
        </section>

        <section className="settings__card">
          <h2 className="settings__heading">Writing guide</h2>
          <p className="muted settings__note">
            Handed to the agent with every invitation, so it edits in your voice instead of its own.
            Plain text or markdown; nothing here is applied to a document on its own.
          </p>

          {guide === null ? (
            <p className="muted">reading…</p>
          ) : (
            <>
              <textarea
                className="settings__guide"
                value={guide}
                onChange={(event) => {
                  setSettings({ writingGuide: event.target.value, theme: settings?.theme ?? 'system' })
                  setSaved(null)
                }}
                placeholder={PLACEHOLDER}
                spellCheck
                aria-label="Writing guide"
                rows={16}
              />

              <div className="settings__actions">
                <span className="settings__meta">
                  {words} {words === 1 ? 'word' : 'words'}
                  {saved ? (
                    <span className="settings__saved">
                      <Check size={13} aria-hidden="true" /> saved {saved}
                    </span>
                  ) : null}
                </span>
                <button
                  className="button button--primary"
                  type="button"
                  onClick={() => void persist({ writingGuide: guide, theme: settings?.theme ?? 'system' })}
                  disabled={saving}
                >
                  {saving ? 'Saving…' : 'Save guide'}
                </button>
              </div>
            </>
          )}

          {error ? <p className="notice notice--error">{error}</p> : null}
        </section>

        <AgentTokens />
      </main>
    </>
  )
}
