import { chromium } from '@playwright/test'
const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 780, height: 560 }, deviceScaleFactor: 3 })).newPage()
await page.goto('http://127.0.0.1:4319/body-macron.html')
await page.waitForTimeout(900)
await page.screenshot({ path: 'screenshots/macron-surfaces.png' })
console.log(JSON.stringify(await page.evaluate(async () => {
  await document.fonts.ready
  return {
    regular: document.fonts.check('1rem "Source Serif 4"', 'ō'),
    italic: document.fonts.check('italic 1rem "Source Serif 4"', 'ō'),
    display: document.fonts.check('1rem "Young Serif"', 'ō'),
  }
})))
await browser.close()
