import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const browser = await chromium.launch()
for (const mode of [
  { name: 'gaps-desktop', width: 1180, height: 800, mobile: false },
  { name: 'gaps-mobile', width: 390, height: 844, mobile: true },
]) {
  const page = await (await browser.newContext({ viewport: { width: mode.width, height: mode.height }, deviceScaleFactor: mode.mobile ? 3 : 2, isMobile: mode.mobile, hasTouch: mode.mobile })).newPage()
  await page.goto('http://127.0.0.1:4319/')
  await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
  await page.getByRole('button', { name: /open padd/i }).click()
  await page.locator('.documents').waitFor()
  await page.waitForTimeout(600)
  const info = await page.evaluate(() => {
    const r = (el) => el.getBoundingClientRect()
    const sheet = r(document.querySelector('.masthead--row'))
    const logo = r(document.querySelector('.wordmark svg'))
    const field = r(document.querySelector('.search'))
    const gearIcon = r(document.querySelector('.masthead__actions a svg'))
    const plusIcon = r(document.querySelector('.masthead__actions button svg'))
    return {
      sheetLeftPad: Math.round(logo.left - sheet.left),
      logoGap: Math.round(field.left - logo.right),
      fieldToGear: Math.round(gearIcon.left - field.right),
      gearToPlus: Math.round(plusIcon.left - gearIcon.right),
      rightPad: Math.round(sheet.right - plusIcon.right),
      sheetHeight: Math.round(sheet.height),
    }
  })
  await page.screenshot({ path: `screenshots/${mode.name}.png`, clip: { x: 0, y: 0, width: mode.width, height: 180 } })
  console.log(mode.name, JSON.stringify(info))
  await page.close()
}
await browser.close()
