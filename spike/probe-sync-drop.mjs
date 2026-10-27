/** Drops the socket from under a loaded page and reads the bar's state. */
import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1180, height: 800 }, deviceScaleFactor: 4 })
const page = await context.newPage()
await page.goto('http://127.0.0.1:4319/d/the-ghosted-story')
await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
await page.getByRole('button', { name: /open padd/i }).click()
await page.locator('.prose h1').first().waitFor()
await page.waitForTimeout(1500)

const read = async (label) => {
  const state = await page.evaluate(() => {
    const node = document.querySelector('.sync-icon')
    const svg = node?.querySelector('svg')
    return {
      className: node?.className,
      circles: svg ? svg.querySelectorAll('circle').length : 0,
      paths: svg ? svg.querySelectorAll('path').length : 0,
    }
  })
  console.log(label, JSON.stringify(state))
  return state
}

await read('connected')
// Every new socket fails from here on, so the provider's reconnect cannot succeed.
await page.routeWebSocket(/./, (ws) => ws.close())
await page.evaluate(() => {
  const provider = window.__paddo?.collab ?? window.__paddo?.provider
  provider?.disconnect?.()
  provider?.connect?.()
})
await page.waitForTimeout(3000)
const dropped = await read('after drop')
if (dropped.className?.includes('disconnected')) {
  const box = await page.locator('.sync-icon').boundingBox()
  await page.screenshot({ path: 'screenshots/sync-error.png', clip: { x: box.x - 40, y: box.y - 16, width: 260, height: box.height + 32 } })
}
await browser.close()
