/** The bottom bar on a phone: fixed, above the fold, clickable. Throwaway document only. */
import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
const page = await context.newPage()
const errors = []
page.on('pageerror', (error) => errors.push(String(error)))

await page.goto('http://127.0.0.1:4319/')
await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
await page.getByRole('button', { name: /open padd/i }).click()
await page.locator('.documents').waitFor()

const slug = await page.evaluate(async () => {
  const created = await (await fetch('/api/documents', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Bar probe' }) })).json()
  await fetch(`/api/documents/${created.slug}/suggestions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ edits: [
      { original: 'Bar probe', proposed: 'Bar probe one', rationale: 'First.' },
    ]}),
  })
  return created.slug
})
await page.goto(`http://127.0.0.1:4319/d/${slug}`)
await page.locator('.prose h1').first().waitFor()
await page.waitForTimeout(1500)

// The body rename needs prose to rewrite; add a second hunk through the API instead.
const geometry = await page.evaluate(() => {
  const bar = document.querySelector('.bottombar')
  if (!bar) return { missing: true }
  const rect = bar.getBoundingClientRect()
  const accept = [...document.querySelectorAll('.bottombar .button')].find((b) => b.textContent.includes('Accept all'))
  const acceptRect = accept.getBoundingClientRect()
  const top = document.elementFromPoint(acceptRect.x + acceptRect.width / 2, acceptRect.y + acceptRect.height / 2)
  return {
    position: getComputedStyle(bar).position,
    barTop: Math.round(rect.top),
    barBottom: Math.round(rect.bottom),
    viewportHeight: window.innerHeight,
    insideViewport: rect.top < window.innerHeight && rect.bottom <= window.innerHeight + 1,
    acceptColor: getComputedStyle(accept).color,
    rejectColor: getComputedStyle([...document.querySelectorAll('.bottombar .button')].find((b) => b.textContent.includes('Reject all'))).color,
    hitTest: top === accept,
  }
})
await page.screenshot({ path: 'screenshots/bottombar-mobile.png' })
await page.getByRole('button', { name: 'Reject all' }).click()
await page.waitForTimeout(600)
const after = await page.evaluate(() => ({ bar: document.querySelectorAll('.bottombar').length }))
await page.evaluate((target) => fetch(`/api/documents/${target}`, { method: 'DELETE' }), slug)
console.log(JSON.stringify({ slug, geometry, after, errors }, null, 2))
await browser.close()
