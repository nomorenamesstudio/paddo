import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const browser = await chromium.launch()
for (const mode of [
  { name: 'editor-align-desktop', width: 1180, mobile: false },
  { name: 'editor-align-mobile', width: 390, mobile: true },
]) {
  const page = await (await browser.newContext({ viewport: { width: mode.width, height: 800 }, deviceScaleFactor: mode.mobile ? 3 : 2, isMobile: mode.mobile, hasTouch: mode.mobile })).newPage()
  await page.goto('http://127.0.0.1:4319/d/the-ghosted-story')
  await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
  await page.getByRole('button', { name: /open padd/i }).click()
  await page.locator('.prose h1').first().waitFor()
  await page.waitForTimeout(1500)
  const info = await page.evaluate(() => {
    const bar = document.querySelector('.topbar').getBoundingClientRect()
    const text = document.querySelector('.prose p').getBoundingClientRect()
    const r = (v) => Math.round(v * 10) / 10
    return {
      bar: { left: r(bar.left), right: r(bar.right), width: r(bar.width) },
      text: { left: r(text.left), right: r(text.right), width: r(text.width) },
      barVsText: { left: r(bar.left - text.left), right: r(text.right - bar.right) },
    }
  })
  await page.screenshot({ path: `screenshots/${mode.name}.png`, clip: { x: 0, y: 0, width: mode.width, height: 200 } })
  console.log(mode.name, JSON.stringify(info))
  await page.close()
}
await browser.close()
