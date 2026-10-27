import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const browser = await chromium.launch()
for (const scheme of ['light', 'dark']) {
  const context = await browser.newContext({ viewport: { width: 1180, height: 800 }, deviceScaleFactor: 4, colorScheme: scheme })
  const page = await context.newPage()
  await page.goto('http://127.0.0.1:4319/d/the-ghosted-story')
  await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
  await page.getByRole('button', { name: /open padd/i }).click()
  await page.locator('.prose h1').first().waitFor()
  await page.waitForTimeout(1600)
  const sync = page.locator('.sync-icon')
  const read = async () => page.evaluate(() => {
    const node = document.querySelector('.sync-icon')
    const svg = node?.querySelector('svg')
    return {
      state: node?.className,
      label: node?.getAttribute('aria-label'),
      circles: svg ? svg.querySelectorAll('circle').length : 0,
      paths: svg ? svg.querySelectorAll('path').length : 0,
      color: node ? getComputedStyle(node).color : null,
    }
  })
  const connected = await read()
  const box = await sync.boundingBox()
  await page.screenshot({ path: `screenshots/sync-${scheme}-connected.png`, clip: { x: box.x - 40, y: box.y - 16, width: 260, height: box.height + 32 } })

  await context.setOffline(true)
  await page.waitForTimeout(2500)
  const offline = await read()
  await page.screenshot({ path: `screenshots/sync-${scheme}-offline.png`, clip: { x: box.x - 40, y: box.y - 16, width: 260, height: box.height + 32 } })
  console.log(scheme, JSON.stringify({ connected, offline }))
  await context.close()
}
await browser.close()
