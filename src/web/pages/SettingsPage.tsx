import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'

import { api, ApiError } from '../api'
import { TopBar } from '../components/TopBar'

const PLACEHOLDER = `How you want the agent to write. Voice, tone, the words you hate, the ones you keep.

Example: Be direct. Use contractions. Vary sentence length. Have opinions. No corporate speak.`

export function SettingsPage() {
  const [guide, setGuide] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    api
      .getSettings()
      .then((settings) => {
        if (!cancelled) setGuide(settings.writingGuide)
      })
      .catch((problem: unknown) => {
        if (cancelled) return
        setError(problem instanceof ApiError ? problem.message : 'could not load settings')
        setGuide('')
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function save() {
    if (guide === null || saving) return
    setSaving(true)
    setError(null)
    try {
      const settings = await api.saveSettings(guide)
      setGuide(settings.writingGuide)
      setSaved(new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }))
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : 'could not save the guide')
    } finally {
      setSaving(false)
    }
  }

  const words = guide === null ? 0 : guide.trim() ? guide.trim().split(/\s+/).length : 0

  return (
    <>
      <TopBar title="Settings" sync="connected" actions={<span className="topbar__actions" />} />

      <main className="page page--narrow settings">
        <section className="settings__section">
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
                  setGuide(event.target.value)
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
                <button className="button button--primary" type="button" onClick={() => void save()} disabled={saving}>
                  {saving ? 'Saving…' : 'Save guide'}
                </button>
              </div>
            </>
          )}

          {error ? <p className="notice notice--error">{error}</p> : null}
        </section>
      </main>
    </>
  )
}
