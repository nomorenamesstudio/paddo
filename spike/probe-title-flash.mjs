/** What does the top bar say before the document has synced? */
import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1180, height: 860 } })
const page = await context.newPage()
await page.goto('http://127.0.0.1:4319/')
await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
await page.getByRole('button', { name: /open padd/i }).click()
await page.locator('.documents').waitFor()

const client = await context.newCDPSession(page)
await client.send('Network.emulateNetworkConditions', {
  offline: false,
  latency: 400,
  downloadThroughput: (600 * 1024) / 8,
  uploadThroughput: (300 * 1024) / 8,
})

const seen = []
const started = Date.now()
await page.locator('.documents__row', { hasText: 'The quiet interface' }).click()

for (let attempt = 0; attempt < 120; attempt += 1) {
  const state = await page.evaluate(() => ({
    title: document.querySelector('.topbar__title')?.textContent?.trim() ?? null,
    skeleton: Boolean(document.querySelector('.skeleton')),
  }))
  if (state.title && seen.at(-1)?.title !== state.title) seen.push({ ...state, at: Date.now() - started })
  if (!state.skeleton && document) {
    const synced = await page.evaluate(() => Boolean(document.querySelector('.sync-icon--connected')))
    if (synced) break
  }
  await page.waitForTimeout(40)
}

const settled = await page.evaluate(() => ({
  title: document.querySelector('.topbar__title')?.textContent?.trim(),
  heading: document.querySelector('.prose h1')?.textContent?.trim(),
}))
console.log(JSON.stringify({ seen, settled }, null, 2))
await browser.close()
