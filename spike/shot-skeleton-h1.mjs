import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1180, height: 700 }, deviceScaleFactor: 2 })).newPage()
await page.goto('http://127.0.0.1:4319/')
await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
await page.getByRole('button', { name: /open padd/i }).click()
await page.locator('.documents').waitFor()
await page.goto('http://127.0.0.1:4319/d/the-ghosted-story')
await page.locator('.skeleton__title').waitFor({ timeout: 5000 })
const before = await page.locator('.skeleton__title').boundingBox()
const style = await page.evaluate(() => {
  const el = document.querySelector('.skeleton__title')
  const cs = getComputedStyle(el)
  return { fontSize: cs.fontSize, weight: cs.fontWeight, marginTop: cs.marginTop, lineHeight: cs.lineHeight }
})
await page.screenshot({ path: 'screenshots/skeleton-h1.png', clip: { x: 150, y: 60, width: 880, height: 200 } })
await page.locator('.prose h1').waitFor()
await page.waitForTimeout(900)
const after = await page.locator('.prose h1').boundingBox()
const live = await page.evaluate(() => {
  const cs = getComputedStyle(document.querySelector('.prose h1'))
  return { fontSize: cs.fontSize, weight: cs.fontWeight, marginTop: cs.marginTop, lineHeight: cs.lineHeight }
})
console.log(JSON.stringify({ style, live, skeletonTop: Math.round(before.y), liveTop: Math.round(after.y) }))
await browser.close()
