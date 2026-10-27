import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1180, height: 900 }, deviceScaleFactor: 4 })).newPage()
await page.goto('http://127.0.0.1:4319/')
await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
await page.getByRole('button', { name: /open padd/i }).click()
await page.locator('.documents').waitFor()
await page.waitForTimeout(500)
const box = await page.evaluate(() => {
  const list = document.querySelector('.documents')
  const r = list.getBoundingClientRect()
  const item = list.querySelector('.documents__item')
  return {
    listTop: r.top,
    listBorderTop: getComputedStyle(list).borderTopWidth,
    itemMarginLeft: getComputedStyle(item).marginLeft,
    itemRadius: getComputedStyle(item).borderRadius,
    itemBorderBottom: getComputedStyle(item).borderBottom,
  }
})
await page.screenshot({ path: 'screenshots/docs-corner.png', clip: { x: 250, y: box.listTop - 30, width: 420, height: 90 } })
console.log(JSON.stringify(box))
await browser.close()
