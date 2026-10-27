import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const browser = await chromium.launch()

for (const mode of [
  { name: 'fab-mobile', width: 390, height: 844, mobile: true },
  { name: 'fab-desktop', width: 1180, height: 900, mobile: false },
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
  await page.waitForTimeout(600)

  const info = await page.evaluate(() => {
    const button = document.querySelector('.documents__new')
    const rect = button.getBoundingClientRect()
    const style = getComputedStyle(button)
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
    const rows = [...document.querySelectorAll('.documents__item')].map((row) => row.getBoundingClientRect())
    const lastRowBottom = rows.length ? Math.max(...rows.map((r) => r.bottom)) : 0
    return {
      position: style.position,
      size: { width: Math.round(rect.width), height: Math.round(rect.height) },
      fromRight: Math.round(window.innerWidth - rect.right),
      fromBottom: Math.round(window.innerHeight - rect.bottom),
      insideViewport: rect.right <= window.innerWidth && rect.bottom <= window.innerHeight,
      hitTest: hit === button || Boolean(hit?.closest('.documents__new')),
      overlapsLastRow: lastRowBottom > rect.top && rect.top < window.innerHeight,
      background: style.backgroundColor,
      color: style.color,
    }
  })
  await page.screenshot({ path: `screenshots/${mode.name}.png` })
  console.log(mode.name, JSON.stringify(info), errors.length ? errors : '')
  await page.close()
}
await browser.close()
