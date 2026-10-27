import { chromium } from '@playwright/test'
const browser = await chromium.launch()
const page = await (await browser.newContext()).newPage()
await page.goto('file:///home/k/Code/paddo/.cache/font-preview-2.html')
await page.waitForTimeout(1200)
const report = await page.evaluate(async () => {
  const families = ['Young Serif', 'Gambetta', 'Zodiak', 'Author', 'Boska']
  const loaded = {}
  for (const family of families) {
    try {
      const faces = await document.fonts.load(`1rem "${family}"`)
      loaded[family] = { faces: faces.length, ok: faces.length > 0 && faces[0].status === 'loaded' }
    } catch (error) {
      loaded[family] = { error: String(error) }
    }
  }
  const widths = {}
  for (const section of document.querySelectorAll('section')) {
    const h1 = section.querySelector('h1')
    const range = document.createRange()
    range.selectNodeContents(h1)
    widths[section.querySelector('.label').textContent] = {
      width: Math.round(range.getBoundingClientRect().width),
      family: getComputedStyle(h1).fontFamily,
    }
  }
  return { loaded, widths, all: [...document.fonts].map((f) => `${f.family}:${f.status}`) }
})
console.log(JSON.stringify(report, null, 2))
await browser.close()
