import { useState, type FormEvent } from 'react'

import { api, ApiError } from '../api'

export function LoginPage({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.login(password)
      onSuccess()
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : 'could not reach the server')
      setPassword('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="page page--narrow login">
      <h1 className="wordmark">Paddō</h1>
      <p className="muted">A quiet place to draft. One password, no accounts.</p>

      <form onSubmit={submit} className="login__form">
        <label className="field">
          <span className="field__label">Password</span>
          <input
            className="field__input"
            type="password"
            name="password"
            autoComplete="current-password"
            autoFocus
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>

        {error ? (
          <p className="notice notice--error" role="alert">
            {error}
          </p>
        ) : null}

        <button className="button button--primary" type="submit" disabled={busy || password.length === 0}>
          {busy ? 'checking…' : 'Open Paddō'}
        </button>
      </form>
    </main>
  )
}
