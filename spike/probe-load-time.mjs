import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const page = await context.newPage()

await page.goto('http://127.0.0.1:4319/')
await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
await page.getByRole('button', { name: /open padd/i }).click()
await page.locator('.documents').waitFor()

const started = Date.now()
await page.locator('.documents__row').first().click()
await page.locator('.prose h1').first().waitFor({ timeout: 30000 })
const headingAt = Date.now() - started
await page.locator('.prose h1').first().waitFor({ state: 'visible' })
const textAt = await page.evaluate(() => performance.now())
const metrics = await page.evaluate(() => {
  const nav = performance.getEntriesByType('navigation')[0]
  const paints = performance.getEntriesByType('paint').map((p) => ({ name: p.name, at: Math.round(p.startTime) }))
  return {
    domContentLoaded: Math.round(nav?.domContentLoadedEventEnd ?? 0),
    loadEvent: Math.round(nav?.loadEventEnd ?? 0),
    paints,
    syncLabel: document.querySelector('.sync')?.textContent?.trim(),
    chars: window.__paddo?.editor?.getText().length ?? null,
  }
})
console.log(JSON.stringify({ headingMs: headingAt, now: Math.round(textAt), metrics }, null, 2))
await browser.close()
