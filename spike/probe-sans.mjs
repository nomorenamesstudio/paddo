import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1180, height: 950 }, deviceScaleFactor: 2 })).newPage()
const errors = []
page.on('pageerror', (error) => errors.push(String(error)))
await page.goto('http://127.0.0.1:4319/')
await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
await page.getByRole('button', { name: /open padd/i }).click()
await page.locator('.documents').waitFor()
await page.waitForTimeout(500)
const list = await page.evaluate(() => ({
  meta: getComputedStyle(document.querySelector('.documents__meta')).fontFamily,
  search: getComputedStyle(document.querySelector('.search__input')).fontFamily,
  title: getComputedStyle(document.querySelector('.documents__title')).fontFamily,
}))
await page.screenshot({ path: 'screenshots/sans-list.png', clip: { x: 200, y: 0, width: 800, height: 420 } })

await page.goto('http://127.0.0.1:4319/d/the-ghosted-story')
await page.locator('.prose h1').first().waitFor()
await page.waitForTimeout(1500)
const editor = await page.evaluate(() => ({
  rationale: getComputedStyle(document.querySelector('.sug-rationale')).fontFamily,
  action: getComputedStyle(document.querySelector('.sug-action')).fontFamily,
  body: getComputedStyle(document.querySelector('.prose p')).fontFamily,
}))
await page.screenshot({ path: 'screenshots/sans-editor.png' })

await page.goto('http://127.0.0.1:4319/settings')
await page.locator('.settings__themes').waitFor()
await page.waitForTimeout(400)
const settings = await page.evaluate(() => ({
  themeButton: getComputedStyle(document.querySelector('.settings__theme')).fontFamily,
  note: getComputedStyle(document.querySelector('.settings__note')).fontFamily,
}))
await page.screenshot({ path: 'screenshots/sans-settings.png', clip: { x: 200, y: 0, width: 800, height: 420 } })
console.log(JSON.stringify({ list, editor, settings, errors }, null, 2))
await browser.close()
