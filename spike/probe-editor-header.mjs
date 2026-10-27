import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const browser = await chromium.launch()
for (const mode of [
  { name: 'editor-header-desktop', width: 1180, height: 800, mobile: false, scheme: 'light' },
  { name: 'editor-header-mobile', width: 390, height: 844, mobile: true, scheme: 'light' },
  { name: 'editor-header-dark', width: 1180, height: 800, mobile: false, scheme: 'dark' },
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
  await page.goto('http://127.0.0.1:4319/d/the-ghosted-story')
  await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
  await page.getByRole('button', { name: /open padd/i }).click()
  await page.locator('.prose h1').first().waitFor()
  await page.waitForTimeout(1500)
  const info = await page.evaluate(() => {
    const bar = document.querySelector('.topbar')
    const style = getComputedStyle(bar)
    const rect = bar.getBoundingClientRect()
    const back = document.querySelector('.topbar__back').getBoundingClientRect()
    const title = document.querySelector('.topbar__title').getBoundingClientRect()
    const status = document.querySelector('.status .button--icon').getBoundingClientRect()
    const robot = [...document.querySelectorAll('.topbar .button--icon')].pop().getBoundingClientRect()
    const r = (v) => Math.round(v * 10) / 10
    return {
      position: style.position,
      radius: style.borderRadius,
      background: style.backgroundColor,
      shadow: style.boxShadow.slice(0, 40),
      height: r(rect.height),
      leftMargin: r(rect.left),
      rightMargin: r(window.innerWidth - rect.right),
      gaps: {
        backToTitle: r(title.left - back.right),
        titleToStatus: r(status.left - title.right),
        statusToRobot: r(robot.left - status.right),
      },
      robotWidth: r(robot.width),
      backSize: { w: r(back.width), h: r(back.height) },
    }
  })
  await page.screenshot({ path: `screenshots/${mode.name}.png`, clip: { x: 0, y: 0, width: mode.width, height: 170 } })
  console.log(mode.name, JSON.stringify(info), errors.length ? errors : '')
  await page.close()
}
await browser.close()
