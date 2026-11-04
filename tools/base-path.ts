/**
 * Normalises PADDO_BASE_PATH to the one shape Vite can concatenate: '/' or '/prefix/'.
 *
 * Vite joins this value to every asset URL it writes, so the trailing slash is what
 * turns '/paddo' into '/paddo/assets/x.js' rather than '/paddoassets/x.js'. A proxy
 * that serves the app under a subpath sets it at build time; everything else leaves
 * it unset and gets the origin root.
 */
export function basePath(raw: string | undefined): string {
  const value = (raw ?? '').trim()
  if (value === '' || value === '/') return '/'
  return `/${value.replace(/^\/+/, '').replace(/\/+$/, '')}/`
}
