import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const browser = await chromium.launch()
for (const mode of [
  { name: 'align-desktop', width: 1180, height: 900, mobile: false },
  { name: 'align-mobile', width: 390, height: 844, mobile: true },
]) {
  const page = await (await browser.newContext({ viewport: { width: mode.width, height: mode.height }, deviceScaleFactor: mode.mobile ? 3 : 2, isMobile: mode.mobile, hasTouch: mode.mobile })).newPage()
  await page.goto('http://127.0.0.1:4319/')
  await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
  await page.getByRole('button', { name: /open padd/i }).click()
  await page.locator('.documents').waitFor()
  await page.waitForTimeout(500)
  await page.getByLabel('Search documents').fill('a')
  await page.waitForTimeout(300)
  const info = await page.evaluate(() => {
    const centre = (node) => {
      const box = node.getBoundingClientRect()
      return Math.round((box.top + box.height / 2) * 10) / 10
    }
    const logo = document.querySelector('.wordmark svg')
    const field = document.querySelector('.search__input')
    const icon = document.querySelector('.search__icon')
    const clear = document.querySelector('.search__clear')
    const gear = document.querySelector('.masthead__actions a')
    const rowCentre = centre(document.querySelector('.masthead--row'))
    return {
      logoHeight: Math.round(logo.getBoundingClientRect().height * 10) / 10,
      rowCentre,
      logo: centre(logo),
      field: centre(field),
      icon: centre(icon),
      clear: centre(clear),
      gear: centre(gear),
      fieldHeight: Math.round(field.getBoundingClientRect().height),
    }
  })
  await page.screenshot({ path: `screenshots/${mode.name}.png`, clip: { x: 0, y: 0, width: mode.width, height: 130 } })
  console.log(mode.name, JSON.stringify(info))
  await page.close()
}
await browser.close()
