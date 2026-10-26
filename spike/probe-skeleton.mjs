/** Does the document open with a visible placeholder instead of a blank editor? */
import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1180, height: 860 }, deviceScaleFactor: 2 })
const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto('http://127.0.0.1:4319/')
await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
await page.getByRole('button', { name: /open padd/i }).click()
await page.locator('.documents').waitFor()

// Throttle so the placeholder can actually be seen, then open a document.
const client = await context.newCDPSession(page)
await client.send('Network.emulateNetworkConditions', {
  offline: false,
  latency: 250,
  downloadThroughput: (700 * 1024) / 8,
  uploadThroughput: (400 * 1024) / 8,
})

const started = Date.now()
await page.locator('.documents__row').first().click()

let sawSkeleton = false
for (let attempt = 0; attempt < 60; attempt += 1) {
  if (await page.locator('.skeleton').count()) {
    sawSkeleton = true
    break
  }
  await page.waitForTimeout(25)
}
if (sawSkeleton) await page.screenshot({ path: 'screenshots/loading-document.png' })

await page.locator('.prose h1').first().waitFor({ timeout: 30000 })
const readyMs = Date.now() - started

const after = await page.evaluate(() => ({
  skeletonLeft: document.querySelectorAll('.skeleton').length,
  title: document.querySelector('.skeleton__title')?.textContent ?? null,
  chars: window.__paddo?.editor?.getText().length ?? 0,
}))

await client.send('Network.emulateNetworkConditions', {
  offline: false,
  latency: 0,
  downloadThroughput: -1,
  uploadThroughput: -1,
})
await page.waitForTimeout(200)

console.log(JSON.stringify({ sawSkeleton, readyMs, after, errors }, null, 2))
await browser.close()
