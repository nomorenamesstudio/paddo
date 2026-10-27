import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1180, height: 860 }, deviceScaleFactor: 2 })).newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto('http://127.0.0.1:4319/d/the-ghosted-story')
await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
await page.getByRole('button', { name: /open padd/i }).click()
await page.locator('.prose h1').first().waitFor()
await page.waitForTimeout(3200)
// The title phase should be the one on screen by now.
const before = await page.evaluate(() => ({
  phase: document.querySelector('.headline__layer[data-state="current"]')?.className,
  text: document.querySelector('.headline__layer[data-state="current"]')?.textContent?.trim(),
}))
await page.getByRole('button', { name: 'Invite the agent' }).click()
await page.locator('.sheet').waitFor()
await page.waitForTimeout(400)
const during = await page.evaluate(() => ({
  shellInert: document.querySelector('.shell')?.hasAttribute('inert'),
  sheetIsOutsideShell: !document.querySelector('.shell')?.contains(document.querySelector('.sheet')),
  copyEnabled: !document.querySelector('.sheet__actions button.button--primary')?.disabled,
}))
await page.screenshot({ path: 'screenshots/sheet-inert.png' })
await page.locator('.sheet__close').click()
await page.waitForTimeout(300)
const after = await page.evaluate(() => document.querySelector('.shell')?.hasAttribute('inert'))
console.log(JSON.stringify({ before, during, after, errors }))
await browser.close()
