import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const browser = await chromium.launch()
for (const mode of [
  { name: 'logo-header-desktop', width: 1180, height: 900, mobile: false },
  { name: 'logo-header-mobile', width: 390, height: 844, mobile: true },
]) {
  const page = await (await browser.newContext({
    viewport: { width: mode.width, height: mode.height },
    deviceScaleFactor: mode.mobile ? 3 : 2,
    isMobile: mode.mobile,
    hasTouch: mode.mobile,
  })).newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.goto('http://127.0.0.1:4319/')
  await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
  await page.getByRole('button', { name: /open padd/i }).click()
  await page.locator('.documents').waitFor()
  await page.waitForTimeout(500)
  const info = await page.evaluate(() => {
    const svg = document.querySelector('.wordmark svg')
    const box = svg.getBoundingClientRect()
    const search = document.querySelector('.search').getBoundingClientRect()
    const gear = document.querySelector('.masthead__actions a').getBoundingClientRect()
    const order = [...document.querySelector('.masthead--row').children].map((n) => n.className || n.tagName)
    return {
      logoIsSvg: Boolean(svg),
      logoBox: { width: Math.round(box.width), height: Math.round(box.height) },
      searchLeft: Math.round(search.left),
      searchWidth: Math.round(search.width),
      gearLeft: Math.round(gear.left),
      searchBetweenLogoAndGear: box.right < search.left && search.right < gear.left,
      placeholder: document.querySelector('.search__input').placeholder,
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      order,
    }
  })
  await page.screenshot({ path: `screenshots/${mode.name}.png`, clip: { x: 0, y: 0, width: mode.width, height: Math.min(260, mode.height) } })
  console.log(mode.name, JSON.stringify(info), errors.length ? errors : '')
  await page.close()
}
await browser.close()
