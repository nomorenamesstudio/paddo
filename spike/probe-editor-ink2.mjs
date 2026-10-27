import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const browser = await chromium.launch()
for (const mode of [
  { name: 'bar2-desktop', width: 1180, mobile: false },
  { name: 'bar2-mobile', width: 390, mobile: true },
]) {
  const page = await (await browser.newContext({ viewport: { width: mode.width, height: 800 }, deviceScaleFactor: 3, isMobile: mode.mobile, hasTouch: mode.mobile })).newPage()
  await page.goto('http://127.0.0.1:4319/d/the-ghosted-story')
  await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
  await page.getByRole('button', { name: /open padd/i }).click()
  await page.locator('.prose h1').first().waitFor()
  await page.waitForTimeout(1600)
  const m = await page.evaluate(() => {
    const ink = (svg) => {
      const rects = [...svg.querySelectorAll('path, line, polyline, rect, circle')].map((n) => n.getBoundingClientRect())
      return {
        left: Math.min(...rects.map((x) => x.left)),
        right: Math.max(...rects.map((x) => x.right)),
      }
    }
    const sheet = document.querySelector('.topbar').getBoundingClientRect()
    const chevron = ink(document.querySelector('.topbar__back svg'))
    const title = document.querySelector('.topbar__title').getBoundingClientRect()
    const sync = document.querySelector('.sync-icon').getBoundingClientRect()
    const statusButton = document.querySelector('.status .button--icon')
    const statusInk = ink(statusButton.querySelector('svg'))
    const carets = statusButton.querySelectorAll('svg')
    const caretInk = carets.length > 1 ? ink(carets[carets.length - 1]) : null
    const robot = ink([...document.querySelectorAll('.topbar .button--icon')].pop().querySelector('svg'))
    const r = (v) => Math.round(v * 10) / 10
    return {
      chevronFromEdge: r(chevron.left - sheet.left),
      titleToSync: r(sync.left - title.right),
      syncToStatus: r(statusInk.left - sync.right),
      statusInkToRobot: r(robot.left - (caretInk?.right ?? statusInk.right)),
      robotToEdge: r(sheet.right - robot.right),
    }
  })
  await page.screenshot({ path: `screenshots/${mode.name}.png`, clip: { x: 0, y: 0, width: mode.width, height: 150 } })
  console.log(mode.name, JSON.stringify(m))
  await page.close()
}
await browser.close()
