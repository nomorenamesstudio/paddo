import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1180, height: 780 }, deviceScaleFactor: 2 })
const page = await context.newPage()
await page.goto('http://127.0.0.1:4319/')
await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
await page.getByRole('button', { name: /open padd/i }).click()
await page.locator('.documents').waitFor()

const client = await context.newCDPSession(page)
await client.send('Network.emulateNetworkConditions', { offline: false, latency: 400, downloadThroughput: (900 * 1024) / 8, uploadThroughput: (300 * 1024) / 8 })
await page.locator('.documents__row', { hasText: 'The quiet interface' }).click()
await page.locator('.loading').waitFor({ timeout: 8000 })
const duringLoad = await page.evaluate(() => ({
  hint: document.querySelectorAll('.editor__hint').length,
  bodyText: document.querySelector('.editor')?.textContent?.trim().slice(0, 60),
}))
await page.screenshot({ path: 'screenshots/loading.png' })
await client.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
await page.locator('.prose h1').first().waitFor({ timeout: 20000 })
await page.waitForTimeout(1200)
const afterLoad = await page.evaluate(() => ({
  hint: document.querySelectorAll('.editor__hint').length,
  paragraphs: document.querySelectorAll('.prose > p').length,
}))
console.log(JSON.stringify({ duringLoad, afterLoad }, null, 2))
await browser.close()
