import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })).newPage()
await page.goto('http://127.0.0.1:4319/')
await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
await page.getByRole('button', { name: /open padd/i }).click()
await page.locator('.documents').waitFor()
await page.waitForTimeout(500)
const info = await page.evaluate(() => {
  const items = [...document.querySelectorAll('.documents > .documents__item')]
  const last = items[items.length - 1]
  const summary = document.querySelector('.archive__summary')
  return {
    lastItemBorderBottom: getComputedStyle(last).borderBottomWidth,
    summaryBorderTop: getComputedStyle(summary).borderTopWidth,
    gapBetween: Math.round(summary.getBoundingClientRect().top - last.getBoundingClientRect().bottom),
  }
})
const box = await page.locator('.archive').boundingBox()
await page.screenshot({ path: 'screenshots/archive-line.png', fullPage: false, clip: { x: 0, y: box.y - 90, width: 390, height: 160 } })
console.log(JSON.stringify(info))
await browser.close()
