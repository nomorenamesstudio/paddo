/** Opening sequence, then a reconnect to prove the animation replays. */
import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1180, height: 800 }, deviceScaleFactor: 3 })
const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto('http://127.0.0.1:4319/')
await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
await page.getByRole('button', { name: /open padd/i }).click()
await page.locator('.documents').waitFor()

const phase = async () => page.evaluate(() => {
  const current = document.querySelector('.headline__layer[data-state="current"]')
  return current?.textContent?.trim()
})
const shot = async (name) => {
  const box = await page.locator('.topbar').boundingBox()
  await page.screenshot({ path: `screenshots/${name}.png`, clip: box })
}

await page.goto('http://127.0.0.1:4319/d/the-ghosted-story')
await page.waitForTimeout(150)
const opening = await phase()
await shot('headline-syncing')

await page.locator('.headline__layer--synced[data-state="current"]').waitFor({ timeout: 15000 })
await page.waitForTimeout(120)
const synced = await phase()
await shot('headline-synced')

await page.locator('.headline__layer--title[data-state="current"]').waitFor({ timeout: 15000 })
await page.waitForTimeout(200)
const titled = await phase()
await shot('headline-title')

// A drop: go offline so the socket dies, then come back and watch the header replay.
await context.setOffline(true)
await page.waitForTimeout(4000)
const offline = await phase()
await shot('headline-offline')

await context.setOffline(false)
await page.waitForTimeout(1200)
const replayed = await phase()
await shot('headline-replay')
await page.waitForTimeout(3000)
const settled = await phase()

console.log(JSON.stringify({ opening, synced, titled, offline, replayed, settled, errors }))
await browser.close()
