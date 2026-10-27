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
await page.waitForTimeout(600)
await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
await page.waitForTimeout(400)
const gap = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('.documents__item, .archive__summary')]
  const last = rows[rows.length - 1].getBoundingClientRect()
  const fab = document.querySelector('.documents__new').getBoundingClientRect()
  return { lastBottom: Math.round(last.bottom), fabTop: Math.round(fab.top), gap: Math.round(fab.top - last.bottom) }
})
await page.screenshot({ path: 'screenshots/fab-mobile-bottom.png' })
console.log(JSON.stringify(gap))
await browser.close()
