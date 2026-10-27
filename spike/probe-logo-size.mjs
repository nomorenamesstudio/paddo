import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const browser = await chromium.launch()
for (const mode of [
  { name: 'logo-size-desktop', width: 1180, height: 900, mobile: false },
  { name: 'logo-size-mobile', width: 390, height: 844, mobile: true },
]) {
  const page = await (await browser.newContext({ viewport: { width: mode.width, height: mode.height }, deviceScaleFactor: mode.mobile ? 3 : 2, isMobile: mode.mobile, hasTouch: mode.mobile })).newPage()
  await page.goto('http://127.0.0.1:4319/')
  await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
  await page.getByRole('button', { name: /open padd/i }).click()
  await page.locator('.documents').waitFor()
  await page.waitForTimeout(500)
  const info = await page.evaluate(() => {
    const svg = document.querySelector('.wordmark svg')
    const box = svg.getBoundingClientRect()
    const path = svg.querySelector('path').getBoundingClientRect()
    const field = document.querySelector('.search__input').getBoundingClientRect()
    return {
      box: { width: Math.round(box.width), height: Math.round(box.height) },
      ink: { width: Math.round(path.width), height: Math.round(path.height) },
      searchHeight: Math.round(field.height),
      logoRatio: Math.round((box.width / box.height) * 100) / 100,
    }
  })
  await page.screenshot({ path: `screenshots/${mode.name}.png`, clip: { x: 0, y: 0, width: mode.width, height: 140 } })
  console.log(mode.name, JSON.stringify(info))
  await page.close()
}
await browser.close()
