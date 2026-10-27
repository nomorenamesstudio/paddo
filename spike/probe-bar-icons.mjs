import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const browser = await chromium.launch()
for (const scheme of ['light', 'dark']) {
  const page = await (await browser.newContext({ viewport: { width: 1180, height: 800 }, deviceScaleFactor: 3, colorScheme: scheme })).newPage()
  await page.goto('http://127.0.0.1:4319/d/the-ghosted-story')
  await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
  await page.getByRole('button', { name: /open padd/i }).click()
  await page.locator('.prose h1').first().waitFor()
  await page.waitForTimeout(1500)
  const info = await page.evaluate(() => {
    const colour = (selector) => {
      const node = document.querySelector(selector)
      return node ? getComputedStyle(node).color : null
    }
    return {
      statusIcon: colour('.status .status-icon'),
      caret: colour('.status__caret'),
      robot: colour('.topbar .button--icon svg'),
      sync: colour('.sync-icon'),
      title: colour('.topbar__title'),
    }
  })
  const bar = await page.locator('.topbar').boundingBox()
  await page.screenshot({ path: `screenshots/bar-icons-${scheme}.png`, clip: { x: bar.x, y: bar.y, width: bar.width, height: bar.height + 6 } })
  console.log(scheme, JSON.stringify(info))
  await page.close()
}
await browser.close()
