/** Measures ink, not boxes: glyph and well edges, not padded element rects. */
import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const browser = await chromium.launch()
for (const mode of [
  { name: 'optical-desktop', width: 1180, mobile: false },
  { name: 'optical-mobile', width: 390, mobile: true },
]) {
  const page = await (await browser.newContext({ viewport: { width: mode.width, height: 800 }, deviceScaleFactor: 3, isMobile: mode.mobile, hasTouch: mode.mobile })).newPage()
  await page.goto('http://127.0.0.1:4319/')
  await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
  await page.getByRole('button', { name: /open padd/i }).click()
  await page.locator('.documents').waitFor()
  await page.waitForTimeout(500)
  const m = await page.evaluate(() => {
    const box = (node) => {
      const r = node.getBoundingClientRect()
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }
    }
    // Union of the glyph paths is the ink; the svg box is cropped to it already.
    const inkOf = (svg) => {
      const rects = [...svg.querySelectorAll('path')].map((p) => p.getBoundingClientRect())
      return {
        left: Math.min(...rects.map((r) => r.left)),
        right: Math.max(...rects.map((r) => r.right)),
        top: Math.min(...rects.map((r) => r.top)),
        bottom: Math.max(...rects.map((r) => r.bottom)),
      }
    }
    const sheet = box(document.querySelector('.masthead--row'))
    const logo = inkOf(document.querySelector('.wordmark svg'))
    const well = box(document.querySelector('.search__input'))
    const gearIcon = inkOf(document.querySelector('.masthead__actions a svg'))
    const gear = box(document.querySelector('.masthead__actions a'))
    const plusIcon = inkOf(document.querySelector('.masthead__actions button svg'))
    const plus = box(document.querySelector('.masthead__actions button'))
    const r = (v) => Math.round(v * 10) / 10
    return {
      sheet: { left: r(sheet.left), right: r(sheet.right), top: r(sheet.top), bottom: r(sheet.bottom), height: r(sheet.height) },
      // Horizontal ink gaps, left to right.
      outerLeft: r(logo.left - sheet.left),
      logoToWell: r(well.left - logo.right),
      wellToGear: r(gearIcon.left - well.right),
      gearToPlus: r(plusIcon.left - gearIcon.right),
      plusToEdge: r(sheet.right - plusIcon.right),
      outerRight: r(sheet.right - plusIcon.right),
      // Vertical: how much air above and below the well.
      topAir: r(well.top - sheet.top),
      bottomAir: r(sheet.bottom - well.bottom),
      wellHeight: r(well.height),
      gearButton: { left: r(gear.left), right: r(gear.right) },
      plusButton: { left: r(plus.left), right: r(plus.right) },
      wellRadius: getComputedStyle(document.querySelector('.search__input')).borderRadius,
    }
  })
  console.log(mode.name, JSON.stringify(m, null, 1))
  await page.close()
}
await browser.close()
