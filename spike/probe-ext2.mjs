import { chromium } from '@playwright/test'
const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 900, height: 360 }, deviceScaleFactor: 3 })).newPage()
await page.goto('http://127.0.0.1:4319/ext-test.html')
await page.waitForTimeout(800)
await page.screenshot({ path: 'screenshots/extended-latin.png' })
await browser.close()
