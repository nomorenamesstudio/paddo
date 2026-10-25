import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App'
import './styles/app.css'

// No service worker on localhost or the LAN over plain HTTP: it cannot register
// there anyway, and a precached shell would hide rebuilds. A real HTTPS origin
// (Tailscale, a proxy) gets the PWA.
const pwaHost = !/(^localhost$|^127\.|^10\.|^192\.168\.)/.test(window.location.hostname)
if (import.meta.env.PROD && window.isSecureContext && pwaHost) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}

const container = document.getElementById('root')
if (!container) throw new Error('missing #root')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
