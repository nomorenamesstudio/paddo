import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

import { basePath } from './tools/base-path'

/**
 * Where the app is mounted: '/' unless a subpath deployment says otherwise. This is
 * a build-time choice, because every asset URL, the service worker scope and the web
 * app manifest are written from it. `PADDO_BASE_PATH=/paddo/` is the shape a reverse
 * proxy that strips the prefix (tailscale serve --set-path) needs.
 */
const base = basePath(process.env.PADDO_BASE_PATH)

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Registered by hand in main.tsx, and only on a real secure origin: a
      // precached app shell serving stale bundles during development is a trap.
      injectRegister: null,
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Paddō',
        short_name: 'Paddo',
        description: 'A quiet markdown editor for prose, with an agent that proposes edits you review inline.',
        // Relative, so an installed app reopens inside the mount prefix instead of
        // at the origin root.
        start_url: '.',
        scope: '.',
        display: 'standalone',
        background_color: '#f7f4ef',
        theme_color: '#f7f4ef',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,png,svg}'],
        navigateFallback: `${base}index.html`,
        // Not anchored: the request carries the mount prefix, and the pattern has to
        // hold with and without one.
        navigateFallbackDenylist: [/\/api\//],
      },
    }),
  ],
  build: {
    outDir: 'dist/web',
    emptyOutDir: true,
    target: 'es2022',
  },
  server: {
    host: true,
    port: 5183,
  },
})
