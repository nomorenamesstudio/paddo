import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })).newPage()
await page.goto('http://127.0.0.1:4319/')
await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
await page.getByRole('button', { name: /open padd/i }).click()
await page.locator('.documents').waitFor()
await page.waitForTimeout(500)

const sizes = await page.evaluate(() => {
  const read = (selector) => {
    const node = document.querySelector(selector)
    return node ? Math.round(parseFloat(getComputedStyle(node).fontSize) * 100) / 100 : null
  }
  return {
    search: read('.search__input'),
    rowRadius: getComputedStyle(document.querySelector('.documents__item')).borderRadius,
    rowInset: getComputedStyle(document.querySelector('.documents__item')).paddingLeft,
  }
})
await page.locator('.documents__item').first().hover().catch(() => {})
await page.screenshot({ path: 'screenshots/rows-square.png', clip: { x: 0, y: 60, width: 390, height: 320 } })

await page.goto('http://127.0.0.1:4319/settings')
await page.locator('.settings__guide').waitFor()
const settingsSizes = await page.evaluate(() => ({
  guide: Math.round(parseFloat(getComputedStyle(document.querySelector('.settings__guide')).fontSize) * 100) / 100,
}))

await page.goto('http://127.0.0.1:4319/d/new-draft-6')
await page.locator('.prose h1').first().waitFor()
await page.waitForTimeout(1200)
await page.getByRole('button', { name: 'Invite the agent' }).click()
await page.locator('.sheet').waitFor()
const sheetSizes = await page.evaluate(() => ({
  instruction: Math.round(parseFloat(getComputedStyle(document.querySelector('.field__input')).fontSize) * 100) / 100,
}))
console.log(JSON.stringify({ sizes, settingsSizes, sheetSizes }, null, 2))
await browser.close()
