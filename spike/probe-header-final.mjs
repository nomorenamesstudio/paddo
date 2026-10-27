import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const browser = await chromium.launch()
for (const mode of [
  { name: 'final-desktop', width: 1180, height: 800, mobile: false, scheme: 'light' },
  { name: 'final-mobile', width: 390, height: 844, mobile: true, scheme: 'light' },
  { name: 'final-mobile-dark', width: 390, height: 844, mobile: true, scheme: 'dark' },
]) {
  const page = await (await browser.newContext({
    viewport: { width: mode.width, height: mode.height },
    deviceScaleFactor: mode.mobile ? 3 : 2,
    isMobile: mode.mobile,
    hasTouch: mode.mobile,
    colorScheme: mode.scheme,
  })).newPage()
  await page.goto('http://127.0.0.1:4319/')
  await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
  await page.getByRole('button', { name: /open padd/i }).click()
  await page.locator('.documents').waitFor()
  await page.waitForTimeout(600)
  await page.screenshot({ path: `screenshots/${mode.name}.png`, clip: { x: 0, y: 0, width: mode.width, height: 260 } })
  const style = await page.evaluate(() => {
    const input = document.querySelector('.search__input')
    const g = getComputedStyle(input)
    const gear = getComputedStyle(document.querySelector('.masthead__actions .button--icon'))
    return { fieldBackground: g.backgroundColor, fieldBorder: g.borderColor, gearBorder: gear.borderColor, gearColor: gear.color }
  })
  console.log(mode.name, JSON.stringify(style))
  await page.close()
}
await browser.close()
