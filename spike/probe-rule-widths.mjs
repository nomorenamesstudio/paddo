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
await page.waitForTimeout(400)
const m = await page.evaluate(() => {
  const row = document.querySelector('.documents > .documents__item')
  const summary = document.querySelector('.archive__summary')
  const header = document.querySelector('.masthead--row')
  const r = (n) => { const b = n.getBoundingClientRect(); return { left: Math.round(b.left * 10) / 10, right: Math.round(b.right * 10) / 10, width: Math.round(b.width * 10) / 10 } }
  return { row: r(row), summary: r(summary), sheet: r(header) }
})
console.log(JSON.stringify(m, null, 1))
await browser.close()
