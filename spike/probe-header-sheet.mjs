import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const browser = await chromium.launch()
for (const mode of [
  { name: 'sheet-desktop', width: 1180, height: 800, mobile: false, scheme: 'light' },
  { name: 'sheet-mobile-dark', width: 390, height: 844, mobile: true, scheme: 'dark' },
]) {
  const page = await (await browser.newContext({
    viewport: { width: mode.width, height: mode.height },
    deviceScaleFactor: mode.mobile ? 3 : 2,
    isMobile: mode.mobile,
    hasTouch: mode.mobile,
    colorScheme: mode.scheme,
  })).newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.goto('http://127.0.0.1:4319/')
  await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
  await page.getByRole('button', { name: /open padd/i }).click()
  await page.locator('.documents').waitFor()
  await page.waitForTimeout(600)
  const rest = await page.evaluate(() => {
    const header = document.querySelector('.masthead--row')
    const style = getComputedStyle(header)
    const rect = header.getBoundingClientRect()
    return {
      top: Math.round(rect.top),
      left: Math.round(rect.left),
      right: Math.round(window.innerWidth - rect.right),
      background: style.backgroundColor,
      radius: style.borderRadius,
      shadow: style.boxShadow.slice(0, 60),
    }
  })
  await page.screenshot({ path: `screenshots/${mode.name}.png`, clip: { x: 0, y: 0, width: mode.width, height: 300 } })

  await page.evaluate(() => window.scrollTo(0, 300))
  await page.waitForTimeout(400)
  const scrolled = await page.evaluate(() => {
    const rect = document.querySelector('.masthead--row').getBoundingClientRect()
    return { top: Math.round(rect.top), scrollY: Math.round(window.scrollY) }
  })
  await page.screenshot({ path: `screenshots/${mode.name}-scrolled.png`, clip: { x: 0, y: 0, width: mode.width, height: 260 } })
  console.log(mode.name, JSON.stringify({ rest, scrolled }), errors.length ? errors : '')
  await page.close()
}
await browser.close()
