import { chromium } from '@playwright/test'
const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 760, height: 300 }, deviceScaleFactor: 3 })).newPage()
await page.goto('http://127.0.0.1:4319/font-check.html')
await page.waitForTimeout(900)
const state = await page.evaluate(async () => {
  await document.fonts.ready
  // Compare an ō against an o in each face: identical advance means the glyph came
  // from a fallback with the same metrics; different means our font drew it.
  const measure = (family, text) => {
    const node = document.createElement('span')
    node.style.cssText = `font-family:${family};font-size:200px;position:absolute;visibility:hidden`
    node.textContent = text
    document.body.append(node)
    const width = node.getBoundingClientRect().width
    node.remove()
    return Math.round(width * 100) / 100
  }
  return {
    display: { o: measure('var(--font-display)', 'o'), macron: measure('var(--font-display)', 'ō') },
    body: { o: measure('var(--font-serif)', 'o'), macron: measure('var(--font-serif)', 'ō') },
  }
})
await page.screenshot({ path: 'screenshots/font-glyphs.png' })
console.log(JSON.stringify(state))
await browser.close()
