/** Can you leave the editor while the document is still loading? */
import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1180, height: 860 } })
const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto('http://127.0.0.1:4319/')
await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
await page.getByRole('button', { name: /open padd/i }).click()
await page.locator('.documents').waitFor()

const client = await context.newCDPSession(page)
await client.send('Network.emulateNetworkConditions', {
  offline: false,
  latency: 350,
  downloadThroughput: (500 * 1024) / 8,
  uploadThroughput: (300 * 1024) / 8,
})

await page.locator('.documents__row', { hasText: 'The quiet interface' }).click()
await page.locator('.topbar__back').waitFor({ timeout: 5000 })

const skeletonUp = await page.locator('.skeleton').count()
const started = Date.now()
await page.locator('.topbar__back').click({ timeout: 5000 })
let reachedHome = false
try {
  await page.locator('.documents').waitFor({ timeout: 15000 })
  reachedHome = true
} catch {
  reachedHome = false
}
console.log(JSON.stringify({ skeletonUp, reachedHome, ms: Date.now() - started, url: page.url(), errors }, null, 2))
await browser.close()
