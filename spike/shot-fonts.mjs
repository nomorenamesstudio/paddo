import { chromium } from '@playwright/test'
const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 820, height: 1400 }, deviceScaleFactor: 2 })).newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('requestfailed', (r) => errors.push(`failed: ${r.url()}`))
await page.goto('file:///home/k/Code/paddo/.cache/font-preview.html')
await page.waitForTimeout(900)
await page.screenshot({ path: 'screenshots/font-candidates.png', fullPage: true })
const widths = await page.evaluate(() =>
  [...document.querySelectorAll('section')].map((section) => ({
    label: section.querySelector('.label')?.textContent,
    font: getComputedStyle(section.querySelector('h1')).fontFamily,
    h1Width: Math.round(section.querySelector('h1').getBoundingClientRect().width),
  })),
)
console.log(JSON.stringify({ widths, errors }, null, 2))
await browser.close()
