import { chromium } from '@playwright/test'
const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 760, height: 320 }, deviceScaleFactor: 3 })).newPage()
await page.goto('http://127.0.0.1:4319/ext-test.html')
await page.waitForTimeout(800)
await page.screenshot({ path: 'screenshots/macron-files.png' })
await browser.close()
