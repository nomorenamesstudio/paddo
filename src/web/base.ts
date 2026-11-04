/**
 * Where the app is mounted: '/' in a normal build, '/paddo/' when a reverse proxy
 * serves it under a subpath (tailscale serve --set-path strips the prefix before
 * forwarding, so the server keeps its root-absolute routes and only the browser
 * needs to know). Set at build time by PADDO_BASE_PATH; Vite rewrites every asset
 * URL from it, and the two helpers below do the same for our own fetches,
 * websockets and in-app links.
 */
export const BASE = import.meta.env.BASE_URL

/** An absolute in-app URL carrying the mount prefix: url('d/x') -> '/paddo/d/x'. */
export function url(path = ''): string {
  return BASE + path.replace(/^\//, '')
}

/** The prefix without its trailing slash: '' at the root, '/paddo' behind a proxy. */
export function mountPath(): string {
  return BASE.replace(/\/$/, '')
}

/** This app's address as someone would type it: the origin plus the mount prefix. */
export function appUrl(): string {
  return `${window.location.origin}${mountPath()}`
}
