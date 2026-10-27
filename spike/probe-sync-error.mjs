import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1180, height: 800 }, deviceScaleFactor: 4 })
const page = await context.newPage()

// Log in first, then let the socket fail: the provider cannot connect, so the bar
// should show the error mark.
await page.goto('http://127.0.0.1:4319/')
await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
await page.getByRole('button', { name: /open padd/i }).click()
await page.locator('.documents').waitFor()

await page.routeWebSocket(/./, (ws) => ws.close())
await page.goto('http://127.0.0.1:4319/d/the-ghosted-story')
await page.locator('.prose h1').first().waitFor()
await page.waitForTimeout(4000)

const state = await page.evaluate(() => {
  const node = document.querySelector('.sync-icon')
  const svg = node?.querySelector('svg')
  return {
    className: node?.className,
    label: node?.getAttribute('aria-label'),
    circles: svg ? svg.querySelectorAll('circle').length : 0,
    paths: svg ? svg.querySelectorAll('path').length : 0,
    color: node ? getComputedStyle(node).color : null,
  }
})
const box = await page.locator('.sync-icon').boundingBox()
await page.screenshot({ path: 'screenshots/sync-error.png', clip: { x: box.x - 40, y: box.y - 16, width: 260, height: box.height + 32 } })
console.log(JSON.stringify(state))
await browser.close()
