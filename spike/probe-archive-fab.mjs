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
await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
await page.waitForTimeout(400)
const m = await page.evaluate(() => {
  const summary = document.querySelector('.archive__summary').getBoundingClientRect()
  const fab = document.querySelector('.documents__new').getBoundingClientRect()
  const r = (v) => Math.round(v * 10) / 10
  return { summaryBottom: r(summary.bottom), fabTop: r(fab.top), clearance: r(fab.top - summary.bottom) }
})
await page.screenshot({ path: 'screenshots/archive-fab-clearance.png' })
console.log(JSON.stringify(m))
await browser.close()
