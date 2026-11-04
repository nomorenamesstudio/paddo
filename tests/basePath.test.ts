import { describe, expect, it } from 'vitest'

import { basePath } from '../tools/base-path'

describe('basePath', () => {
  it('normalises PADDO_BASE_PATH into a path Vite can concatenate', () => {
    // Vite joins this to every asset URL it writes, so the trailing slash is the
    // difference between '/paddo/assets/x.js' and a 404 at '/paddoassets/x.js'.
    expect(basePath(undefined)).toBe('/')
    expect(basePath('')).toBe('/')
    expect(basePath('/')).toBe('/')
    expect(basePath('/paddo')).toBe('/paddo/')
    expect(basePath('paddo/')).toBe('/paddo/')
    expect(basePath('/paddo/')).toBe('/paddo/')
    expect(basePath(' /paddo ')).toBe('/paddo/')
  })
})
