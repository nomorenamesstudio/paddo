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
await page.goto('http://127.0.0.1:4319/d/the-ghosted-story')
await page.locator('.skeleton__line').first().waitFor({ timeout: 5000 })
const skeleton = await page.evaluate(() => {
  const lines = [...document.querySelectorAll('.skeleton__line')]
  const title = document.querySelector('.skeleton__title').getBoundingClientRect()
  const r = (v) => Math.round(v * 10) / 10
  return {
    titleTop: r(title.top), titleBottom: r(title.bottom), titleLeft: r(title.left),
    firstLineTop: r(lines[0].getBoundingClientRect().top),
    pitch: r(lines[1].getBoundingClientRect().top - lines[0].getBoundingClientRect().top),
    lineLeft: r(lines[0].getBoundingClientRect().left),
    lineBoxHeight: r(lines[0].getBoundingClientRect().height),
    tops: lines.map((l) => r(l.getBoundingClientRect().top)),
    margins: lines.map((l) => getComputedStyle(l).marginTop),
    barHeight: r(lines[0].getBoundingClientRect().height * 0 + parseFloat(getComputedStyle(lines[0], '::before').height)),
  }
})
await page.screenshot({ path: 'screenshots/skeleton-rhythm.png', clip: { x: 150, y: 60, width: 900, height: 320 } })
await page.locator('.prose p').first().waitFor()
await page.waitForTimeout(900)
const live = await page.evaluate(() => {
  const h1 = document.querySelector('.prose h1').getBoundingClientRect()
  const p = document.querySelector('.prose p').getBoundingClientRect()
  const r = (v) => Math.round(v * 10) / 10
  const cs = getComputedStyle(document.querySelector('.prose p'))
  return { h1Top: r(h1.top), pTop: r(p.top), pLeft: r(p.left), lineHeight: cs.lineHeight, fontSize: cs.fontSize }
})
console.log(JSON.stringify({ skeleton, live }))
await browser.close()
