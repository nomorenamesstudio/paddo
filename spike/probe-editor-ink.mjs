/** Ink insets inside the editor sheet, to match the library header's numbers. */
import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const browser = await chromium.launch()
for (const mode of [
  { name: 'ink-desktop', width: 1180, mobile: false },
  { name: 'ink-mobile', width: 390, mobile: true },
]) {
  const page = await (await browser.newContext({ viewport: { width: mode.width, height: 800 }, deviceScaleFactor: 3, isMobile: mode.mobile, hasTouch: mode.mobile })).newPage()
  await page.goto('http://127.0.0.1:4319/d/the-ghosted-story')
  await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
  await page.getByRole('button', { name: /open padd/i }).click()
  await page.locator('.prose h1').first().waitFor()
  await page.waitForTimeout(1500)
  const m = await page.evaluate(() => {
    const r = (node) => node.getBoundingClientRect()
    const ink = (svg) => {
      const rects = [...svg.querySelectorAll('path, line, polyline, rect, circle')].map((n) => n.getBoundingClientRect())
      return {
        left: Math.min(...rects.map((x) => x.left)),
        right: Math.max(...rects.map((x) => x.right)),
        top: Math.min(...rects.map((x) => x.top)),
        bottom: Math.max(...rects.map((x) => x.bottom)),
      }
    }
    const sheet = r(document.querySelector('.topbar'))
    const chevron = ink(document.querySelector('.topbar__back svg'))
    const title = r(document.querySelector('.topbar__title'))
    const buttons = [...document.querySelectorAll('.topbar .button--icon')]
    const statusInk = ink(buttons[0].querySelector('svg'))
    const robotInk = ink(buttons[buttons.length - 1].querySelector('svg'))
    const round = (v) => Math.round(v * 10) / 10
    return {
      sheet: { left: round(sheet.left), right: round(sheet.right), top: round(sheet.top), height: round(sheet.height) },
      chevronInkFromEdge: round(chevron.left - sheet.left),
      chevronInkToTitle: round(title.left - chevron.right),
      robotInkToEdge: round(sheet.right - robotInk.right),
      sheetTopToChevronInk: round(chevron.top - sheet.top),
      sheetBottomToChevronInk: round(sheet.bottom - chevron.bottom),
      statusToRobot: round(robotInk.left - statusInk.right),
      buttonBoxes: buttons.map((b) => Math.round(r(b).width)),
    }
  })
  console.log(mode.name, JSON.stringify(m))
  await page.screenshot({ path: `screenshots/${mode.name}.png`, clip: { x: 0, y: 0, width: mode.width, height: 150 } })
  await page.close()
}
await browser.close()
