import { chromium } from '@playwright/test'
const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 760, height: 420 }, deviceScaleFactor: 3 })).newPage()
const failures = []
page.on('requestfailed', (r) => failures.push(r.url().split('/').pop()))
await page.goto('http://127.0.0.1:4319/macron-test.html')
await page.waitForTimeout(900)
await page.screenshot({ path: 'screenshots/macron-ttf.png' })
const state = await page.evaluate(async () => {
  await document.fonts.ready
  return {
    ttf: document.fonts.check('1rem YT', 'ō'),
    kit: document.fonts.check('1rem YKIT', 'ō'),
    faces: [...document.fonts].map((f) => `${f.family}:${f.status}`),
  }
})
console.log(JSON.stringify({ state, failures }))
await browser.close()
