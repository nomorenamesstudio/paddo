import { Suspense, lazy, useCallback, useEffect, useState } from 'react'

import { api, ApiError } from './api'
import { LoadingDocument, humanizeSlug } from './components/LoadingDocument'
import { TopBar } from './components/TopBar'
import { DocumentsPage } from './pages/DocumentsPage'
import { SettingsPage } from './pages/SettingsPage'
import { LoginPage } from './pages/LoginPage'

// The editor is most of the bundle; the document list should not wait for it.
const EditorPage = lazy(() => import('./pages/EditorPage').then((module) => ({ default: module.EditorPage })))

type Route = { name: 'documents' } | { name: 'editor'; slug: string } | { name: 'settings' }

function parseRoute(): Route {
  if (/^\/settings\/?$/.test(window.location.pathname)) return { name: 'settings' }
  const match = window.location.pathname.match(/^\/d\/([a-z0-9-]+)\/?$/)
  if (match?.[1]) return { name: 'editor', slug: match[1] }
  return { name: 'documents' }
}

export function navigate(to: string, options: { replace?: boolean } = {}) {
  if (options.replace) window.history.replaceState({}, '', to)
  else window.history.pushState({}, '', to)
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
            <TopBar title={humanizeSlug(route.slug)} sync="connecting" />
            <main className="editor">
              <LoadingDocument />
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
