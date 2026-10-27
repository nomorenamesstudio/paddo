import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const browser = await chromium.launch()
for (const mode of [
  { name: 'title-centre-desktop', width: 1180, mobile: false, scheme: 'light' },
  { name: 'title-centre-mobile', width: 390, mobile: true, scheme: 'light' },
  { name: 'title-centre-dark', width: 1180, mobile: false, scheme: 'dark' },
]) {
  const page = await (await browser.newContext({ viewport: { width: mode.width, height: 800 }, deviceScaleFactor: 3, isMobile: mode.mobile, hasTouch: mode.mobile, colorScheme: mode.scheme })).newPage()
  await page.goto('http://127.0.0.1:4319/d/the-ghosted-story')
  await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
  await page.getByRole('button', { name: /open padd/i }).click()
  await page.locator('.prose h1').first().waitFor()
  await page.waitForTimeout(1500)
  const m = await page.evaluate(() => {
    const sheet = document.querySelector('.topbar').getBoundingClientRect()
    const title = document.querySelector('.topbar__title').getBoundingClientRect()
    const heading = document.querySelector('.topbar__heading').getBoundingClientRect()
    const r = (v) => Math.round(v * 10) / 10
    return {
      sheetCentre: r(sheet.left + sheet.width / 2),
      titleCentre: r(title.left + title.width / 2),
      headingCentre: r(heading.left + heading.width / 2),
      offset: r(title.left + title.width / 2 - (sheet.left + sheet.width / 2)),
      truncated: document.querySelector('.topbar__title').scrollWidth > document.querySelector('.topbar__title').clientWidth,
    }
  })
  const bar = await page.locator('.topbar').boundingBox()
  await page.screenshot({ path: `screenshots/${mode.name}.png`, clip: { x: 0, y: 0, width: mode.width, height: bar.height + 30 } })
  console.log(mode.name, JSON.stringify(m))
  await page.close()
}
await browser.close()
