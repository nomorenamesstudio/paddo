import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1180, height: 700 }, deviceScaleFactor: 3 })).newPage()
const requests = []
page.on('request', (r) => { if (r.url().includes('/fonts/')) requests.push(r.url().split('/fonts/')[1]) })
await page.goto('http://127.0.0.1:4319/')
await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
await page.getByRole('button', { name: /open padd/i }).click()
await page.locator('.documents').waitFor()
await page.waitForTimeout(1200)

const info = await page.evaluate(async () => {
  await document.fonts.ready
  const mark = document.querySelector('.wordmark')
  const style = getComputedStyle(mark)
  return {
    text: mark?.textContent,
    family: style.fontFamily,
    checkMacron: document.fonts.check(`1rem "Young Serif"`, 'ō'),
    faces: [...document.fonts].map((f) => `${f.family}:${f.status}`),
    textWidth: Math.round(document.createRange ? (() => { const r = document.createRange(); r.selectNodeContents(mark); return r.getBoundingClientRect().width })() : 0),
  }
})
await page.screenshot({ path: 'screenshots/macron-now.png', clip: { x: 200, y: 20, width: 420, height: 110 } })
console.log(JSON.stringify({ info, requests }, null, 2))
await browser.close()
