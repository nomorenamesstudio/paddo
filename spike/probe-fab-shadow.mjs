import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 4, isMobile: true, hasTouch: true })).newPage()
await page.goto('http://127.0.0.1:4319/')
await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
await page.getByRole('button', { name: /open padd/i }).click()
await page.locator('.documents').waitFor()
await page.waitForTimeout(600)
const box = await page.locator('.documents__new').boundingBox()
await page.screenshot({ path: 'screenshots/fab-shadow.png', clip: { x: box.x - 30, y: box.y - 30, width: box.width + 60, height: box.height + 60 } })
const info = await page.evaluate(() => {
  const fab = document.querySelector('.documents__new')
  const style = getComputedStyle(fab)
  const rect = fab.getBoundingClientRect()
  return {
    shadow: style.boxShadow,
    clipAncestor: getComputedStyle(document.documentElement).overflowX,
    bodyOverflow: getComputedStyle(document.body).overflowX,
    rightGap: Math.round(window.innerWidth - rect.right),
    bottomGap: Math.round(window.innerHeight - rect.bottom),
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }
})
console.log(JSON.stringify(info, null, 2))
await browser.close()
