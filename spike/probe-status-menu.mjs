import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const browser = await chromium.launch()
for (const scheme of ['light', 'dark']) {
  const page = await (await browser.newContext({ viewport: { width: 1180, height: 860 }, deviceScaleFactor: 2, colorScheme: scheme })).newPage()
  await page.goto('http://127.0.0.1:4319/')
  await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
  await page.getByRole('button', { name: /open padd/i }).click()
  await page.locator('.documents').waitFor()
  await page.waitForTimeout(500)
  const row = page.locator('.documents__item').first()
  await row.locator('.row-menu__trigger').click()
  await page.locator('.row-menu__panel').waitFor()
  await page.waitForTimeout(300)
  const items = await page.locator('.row-menu__item').allInnerTexts()
  const box = await page.locator('.row-menu__panel').boundingBox()
  await page.screenshot({ path: `screenshots/row-status-menu-${scheme}.png`, clip: { x: box.x - 40, y: box.y - 40, width: box.width + 80, height: box.height + 60 } })
  console.log(scheme, JSON.stringify(items))
  await page.close()
}
await browser.close()
