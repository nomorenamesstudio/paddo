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
await page.waitForTimeout(500)
const info = await page.evaluate(() => {
  const fab = document.querySelector('.documents__new')
  const style = getComputedStyle(fab)
  const svg = fab.querySelector('svg')
  return {
    radius: style.borderRadius,
    background: style.backgroundColor,
    color: style.color,
    stroke: svg ? getComputedStyle(svg).stroke : null,
    size: Math.round(fab.getBoundingClientRect().width),
  }
})
const box = await page.locator('.documents__new').boundingBox()
await page.screenshot({ path: 'screenshots/fab-look.png', clip: { x: box.x - 24, y: box.y - 24, width: box.width + 48, height: box.height + 48 } })
console.log(JSON.stringify(info))
await browser.close()
