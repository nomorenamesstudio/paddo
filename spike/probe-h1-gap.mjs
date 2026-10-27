import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const browser = await chromium.launch()
for (const mode of [
  { name: 'h1gap-desktop', width: 1180, mobile: false },
  { name: 'h1gap-mobile', width: 390, mobile: true },
]) {
  const page = await (await browser.newContext({ viewport: { width: mode.width, height: 800 }, deviceScaleFactor: 3, isMobile: mode.mobile, hasTouch: mode.mobile })).newPage()
  await page.goto('http://127.0.0.1:4319/d/the-ghosted-story')
  await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
  await page.getByRole('button', { name: /open padd/i }).click()
  await page.locator('.prose h1').first().waitFor()
  await page.waitForTimeout(1500)
  const m = await page.evaluate(() => {
    const sheet = document.querySelector('.topbar').getBoundingClientRect()
    const h1 = document.querySelector('.prose h1').getBoundingClientRect()
    const style = getComputedStyle(document.querySelector('.prose h1'))
    const r = (v) => Math.round(v * 10) / 10
    return { sheetBottom: r(sheet.bottom), h1Top: r(h1.top), gap: r(h1.top - sheet.bottom), marginTop: style.marginTop, editorPaddingTop: getComputedStyle(document.querySelector('.editor')).paddingTop }
  })
  await page.screenshot({ path: `screenshots/${mode.name}.png`, clip: { x: 0, y: 0, width: mode.width, height: 320 } })
  console.log(mode.name, JSON.stringify(m))
  await page.close()
}
await browser.close()
