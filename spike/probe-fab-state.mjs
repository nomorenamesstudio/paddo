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
const info = await page.evaluate(() => {
  const fab = document.querySelector('.documents__new')
  const style = getComputedStyle(fab)
  const rect = fab.getBoundingClientRect()
  return {
    position: style.position,
    mediaMatches: window.matchMedia('(max-width: 40rem)').matches,
    innerWidth: window.innerWidth,
    rect: { top: Math.round(rect.top), bottom: Math.round(rect.bottom), right: Math.round(rect.right) },
    viewportHeight: window.innerHeight,
    htmlOverflow: getComputedStyle(document.documentElement).overflowX,
    bodyOverflow: getComputedStyle(document.body).overflowX,
  }
})
await page.screenshot({ path: 'screenshots/fab-state.png' })
console.log(JSON.stringify(info, null, 2))
await browser.close()
