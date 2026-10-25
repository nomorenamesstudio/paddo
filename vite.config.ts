import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
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
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#f7f4ef',
        theme_color: '#f7f4ef',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,png,svg}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
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
