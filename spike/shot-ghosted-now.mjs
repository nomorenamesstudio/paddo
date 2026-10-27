import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1180, height: 950 }, deviceScaleFactor: 2 })).newPage()
await page.goto('http://127.0.0.1:4319/d/new-draft-6')
await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
await page.getByRole('button', { name: /open padd/i }).click()
await page.locator('.prose h1').first().waitFor()
await page.waitForTimeout(1600)
const state = await page.evaluate(() => ({
  hunks: document.querySelectorAll('.sug-hunk').length,
  pending: document.querySelector('.bottombar__count')?.textContent ?? null,
  firstHunkText: document.querySelector('.sug-hunk')?.textContent?.slice(0, 80) ?? null,
}))
await page.screenshot({ path: 'screenshots/ghosted-reproposed.png' })
console.log(JSON.stringify(state))
await browser.close()
