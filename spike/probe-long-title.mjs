import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1180, height: 800 }, deviceScaleFactor: 2 })).newPage()
await page.goto('http://127.0.0.1:4319/')
await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
await page.getByRole('button', { name: /open padd/i }).click()
await page.locator('.documents').waitFor()
const slug = await page.evaluate(async () => (await (await fetch('/api/documents', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'A rather long title that should not collide with the controls at all' }) })).json()).slug)
await page.goto(`http://127.0.0.1:4319/d/${slug}`)
await page.locator('.prose h1').waitFor()
await page.waitForTimeout(1400)
const m = await page.evaluate(() => {
  const sheet = document.querySelector('.topbar').getBoundingClientRect()
  const heading = document.querySelector('.topbar__heading').getBoundingClientRect()
  const robot = [...document.querySelectorAll('.topbar .button--icon')].pop().getBoundingClientRect()
  const back = document.querySelector('.topbar__back').getBoundingClientRect()
  const title = document.querySelector('.topbar__title')
  const r = (v) => Math.round(v * 10) / 10
  return {
    truncated: title.scrollWidth > title.clientWidth,
    headingLeftOfRobot: r(robot.left - heading.right),
    headingRightOfBack: r(heading.left - back.right),
    titleCentreOffset: r(title.getBoundingClientRect().left + title.getBoundingClientRect().width / 2 - (sheet.left + sheet.width / 2)),
  }
})
const bar = await page.locator('.topbar').boundingBox()
await page.screenshot({ path: 'screenshots/title-long.png', clip: { x: 0, y: 0, width: 1180, height: bar.height + 24 } })
await page.evaluate((target) => fetch(`/api/documents/${target}`, { method: 'DELETE' }), slug)
console.log(JSON.stringify(m))
await browser.close()
