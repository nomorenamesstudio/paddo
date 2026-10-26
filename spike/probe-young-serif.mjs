import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1180, height: 900 }, deviceScaleFactor: 2 })).newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto('http://127.0.0.1:4319/')
await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
await page.getByRole('button', { name: /open padd/i }).click()
await page.locator('.documents').waitFor()
await page.waitForTimeout(600)
const homeFonts = await page.evaluate(() => ({
  wordmark: getComputedStyle(document.querySelector('.wordmark')).fontFamily,
  weight: getComputedStyle(document.querySelector('.wordmark')).fontWeight,
  row: getComputedStyle(document.querySelector('.documents__title')).fontFamily,
}))
await page.screenshot({ path: 'screenshots/font-home.png' })

await page.locator('.documents__row', { hasText: 'The quiet interface' }).click()
await page.locator('.prose h1').first().waitFor()
await page.waitForTimeout(1400)
const editorFonts = await page.evaluate(() => ({
  h1: getComputedStyle(document.querySelector('.prose h1')).fontFamily,
  h1Size: getComputedStyle(document.querySelector('.prose h1')).fontSize,
  weight: getComputedStyle(document.querySelector('.prose h1')).fontWeight,
  body: getComputedStyle(document.querySelector('.prose p')).fontFamily,
  topbar: getComputedStyle(document.querySelector('.topbar__title')).fontFamily,
  loaded: document.fonts.check('1rem "Young Serif"'),
}))
await page.screenshot({ path: 'screenshots/font-editor.png' })
console.log(JSON.stringify({ homeFonts, editorFonts, errors }, null, 2))
await browser.close()
