import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1180, height: 900 }, deviceScaleFactor: 3 })).newPage()
await page.goto('http://127.0.0.1:4319/')
await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
await page.getByRole('button', { name: /open padd/i }).click()
await page.locator('.documents').waitFor()
await page.waitForTimeout(500)
await page.locator('.documents__item').first().hover()
await page.waitForTimeout(300)
await page.screenshot({ path: 'screenshots/rows-hover-desktop.png', clip: { x: 230, y: 90, width: 720, height: 300 } })
const state = await page.evaluate(() => ({
  hoverBg: getComputedStyle(document.querySelector('.documents__item')).backgroundColor,
  radius: getComputedStyle(document.querySelector('.documents__item')).borderRadius,
  searchFont: getComputedStyle(document.querySelector('.search__input')).fontSize,
}))
console.log(JSON.stringify(state))
await browser.close()
