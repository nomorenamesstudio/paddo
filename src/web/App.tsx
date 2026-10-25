import { useCallback, useEffect, useState } from 'react'

import { api, ApiError } from './api'
import { DocumentsPage } from './pages/DocumentsPage'
import { EditorPage } from './pages/EditorPage'
import { LoginPage } from './pages/LoginPage'

type Route = { name: 'documents' } | { name: 'editor'; slug: string }

function parseRoute(): Route {
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
    return <EditorPage key={route.slug} slug={route.slug} />
  }

  return <DocumentsPage />
}
