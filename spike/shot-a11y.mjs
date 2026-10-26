import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const browser = await chromium.launch()
for (const scheme of ['light', 'dark']) {
  const page = await (await browser.newContext({ viewport: { width: 1180, height: 900 }, deviceScaleFactor: 2, colorScheme: scheme })).newPage()
  await page.goto('http://127.0.0.1:4319/d/new-draft-6')
  await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
  await page.getByRole('button', { name: /open padd/i }).click()
  await page.locator('.prose h1').first().waitFor()
  await page.waitForTimeout(1500)
  await page.getByRole('button', { name: 'Invite the agent' }).click()
  await page.locator('.sheet').waitFor()
  await page.waitForTimeout(600)
  await page.screenshot({ path: `screenshots/a11y-sheet-${scheme}.png`, clip: { x: 300, y: 180, width: 620, height: 700 } })
  await page.close()
}
await browser.close()
