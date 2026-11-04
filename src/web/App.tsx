import { Suspense, lazy, useCallback, useEffect, useState } from 'react'

import { api, ApiError } from './api'
import { BASE, url } from './base'
import { OpeningSkeleton, humanizeSlug } from './components/OpeningSkeleton'
import { TopBar } from './components/TopBar'
import { DocumentsPage } from './pages/DocumentsPage'
import { SettingsPage } from './pages/SettingsPage'
import { LoginPage } from './pages/LoginPage'
import { applyTheme, storedTheme, watchSystemTheme } from './theme'

// The editor is most of the bundle; the document list should not wait for it.
const EditorPage = lazy(() => import('./pages/EditorPage').then((module) => ({ default: module.EditorPage })))

type Route = { name: 'documents' } | { name: 'editor'; slug: string } | { name: 'settings' }

function parseRoute(): Route {
  const { pathname } = window.location
  // Strip the mount prefix: everything below here thinks in app-relative paths.
  const path = pathname.startsWith(BASE) ? `/${pathname.slice(BASE.length)}` : pathname
  if (/^\/settings\/?$/.test(path)) return { name: 'settings' }
  const match = path.match(/^\/d\/([a-z0-9-]+)\/?$/)
  if (match?.[1]) return { name: 'editor', slug: match[1] }
  return { name: 'documents' }
}

export function navigate(to: string, options: { replace?: boolean } = {}) {
  const target = url(to)
  if (options.replace) window.history.replaceState({}, '', target)
  else window.history.pushState({}, '', target)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export function App() {
  const [route, setRoute] = useState<Route>(parseRoute)
  const [authenticated, setAuthenticated] = useState<boolean | null>(null)

  const checkSession = useCallback(async () => {
    try {
      const { authenticated: yes } = await api.session()
      setAuthenticated(yes)
    } catch (error) {
      if (error instanceof ApiError) setAuthenticated(false)
      else setAuthenticated(false)
    }
  }, [])

  useEffect(() => {
    void checkSession()
  }, [checkSession])

  // The stored choice paints instantly; the saved one arrives with the session and
  // wins, so a second device reads the same way as the first.
  useEffect(() => {
    const stop = watchSystemTheme(storedTheme)
    return stop
  }, [])

  useEffect(() => {
    if (!authenticated) return
    let cancelled = false
    api
      .getSettings()
      .then((settings) => {
        if (!cancelled) applyTheme(settings.theme)
      })
      .catch(() => {
        // Unauthenticated or offline: the cached theme already applied.
      })
    return () => {
      cancelled = true
    }
  }, [authenticated])

  useEffect(() => {
    const onPop = () => setRoute(parseRoute())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  if (authenticated === null) {
    return (
      <main className="page page--narrow">
        <p className="muted">opening paddō…</p>
      </main>
    )
  }

  if (!authenticated) {
    return <LoginPage onSuccess={() => setAuthenticated(true)} />
  }

  if (route.name === 'editor') {
    return (
      <Suspense
        fallback={
          <div className="shell">
            <TopBar title={humanizeSlug(route.slug)} sync="connecting" phase="syncing" />
            <main className="editor">
              <OpeningSkeleton title={humanizeSlug(route.slug)} />
            </main>
          </div>
        }
      >
        <EditorPage key={route.slug} slug={route.slug} />
      </Suspense>
    )
  }

  if (route.name === 'settings') return <SettingsPage />

  return <DocumentsPage />
}
