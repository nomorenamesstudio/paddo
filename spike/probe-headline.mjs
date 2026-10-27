/** Walks the header through loading → synced → title and captures each step. */
import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1180, height: 800 }, deviceScaleFactor: 3 })).newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto('http://127.0.0.1:4319/')
await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
await page.getByRole('button', { name: /open padd/i }).click()
await page.locator('.documents').waitFor()

const state = async () => page.evaluate(() => {
  const current = document.querySelector('.headline__layer[data-state="current"]')
  return { text: current?.textContent?.trim(), layerClass: current?.className }
})
const shot = async (name) => {
  const box = await page.locator('.topbar').boundingBox()
  await page.screenshot({ path: `screenshots/${name}.png`, clip: box })
}

await page.goto('http://127.0.0.1:4319/d/the-ghosted-story')
await page.waitForTimeout(180)
const loading = await state()
await shot('headline-loading')

await page.locator('.headline__layer--synced[data-state="current"]').waitFor({ timeout: 15000 })
await page.waitForTimeout(120)
const synced = await state()
await shot('headline-synced')

await page.locator('.headline__layer--title[data-state="current"]').waitFor({ timeout: 15000 })
await page.waitForTimeout(400)
const titled = await state()
await shot('headline-title')

console.log(JSON.stringify({ loading, synced, titled, errors }))
await browser.close()
