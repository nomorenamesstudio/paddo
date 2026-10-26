import { chromium } from '@playwright/test'
const browser = await chromium.launch()
const page = await (await browser.newContext()).newPage()
const requests = []
page.on('request', (r) => { if (r.url().includes('/fonts/')) requests.push(r.url().split('/fonts/')[1]) })
await page.goto('http://127.0.0.1:4319/subset-test.html')
await page.waitForTimeout(1200)
const state = await page.evaluate(async () => {
  await document.fonts.ready
  return {
    check: document.fonts.check('1rem T', 'ō'),
    faces: [...document.fonts].map((f) => `${f.unicodeRange.slice(0, 9)}/${f.status}`),
  }
})
console.log(JSON.stringify({ requests, state }, null, 2))
await browser.close()
