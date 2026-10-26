import { chromium } from '@playwright/test'
const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 720, height: 420 }, deviceScaleFactor: 3 })).newPage()
const requests = []
page.on('request', (r) => { if (r.url().includes('/fonts/')) requests.push(r.url().split('/fonts/')[1]) })
await page.goto('http://127.0.0.1:4319/macron-ab.html')
await page.waitForTimeout(1000)
await page.screenshot({ path: 'screenshots/macron-ab.png' })
console.log(JSON.stringify({ requests }))
await browser.close()
