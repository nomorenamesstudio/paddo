import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1180, height: 900 }, deviceScaleFactor: 2 })).newPage()
await page.goto('http://127.0.0.1:4319/')
await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
await page.getByRole('button', { name: /open padd/i }).click()
await page.locator('.documents').waitFor()
await page.waitForTimeout(500)

const results = {}
for (const term of ['new', 'new-draft', 'ghosted', 'draft']) {
  await page.getByLabel('Search documents').fill(term)
  await page.waitForTimeout(250)
  results[term] = await page.locator('.documents__title').allInnerTexts()
}
await page.getByLabel('Search documents').fill('new')
await page.waitForTimeout(250)
await page.screenshot({ path: 'screenshots/search-new.png' })
console.log(JSON.stringify(results, null, 2))
await browser.close()
