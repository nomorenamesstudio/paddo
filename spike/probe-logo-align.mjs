import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1180, height: 900 } })).newPage()
await page.goto('http://127.0.0.1:4319/')
await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
await page.getByRole('button', { name: /open padd/i }).click()
await page.locator('.documents').waitFor()
await page.waitForTimeout(400)
const info = await page.evaluate(() => {
  const h1 = document.querySelector('.wordmark')
  const svg = h1.querySelector('svg')
  const row = document.querySelector('.masthead--row')
  const rect = (node) => {
    const b = node.getBoundingClientRect()
    return { top: Math.round(b.top * 10) / 10, height: Math.round(b.height * 10) / 10, bottom: Math.round(b.bottom * 10) / 10 }
  }
  return {
    h1: rect(h1),
    svg: rect(svg),
    row: rect(row),
    h1Style: { display: getComputedStyle(h1).display, fontSize: getComputedStyle(h1).fontSize, lineHeight: getComputedStyle(h1).lineHeight, alignItems: getComputedStyle(h1).alignItems, padding: getComputedStyle(h1).padding, margin: getComputedStyle(h1).margin },
    svgStyle: { display: getComputedStyle(svg).display, verticalAlign: getComputedStyle(svg).verticalAlign, height: getComputedStyle(svg).height },
    childNodes: [...h1.childNodes].map((n) => `${n.nodeType}:${(n.textContent ?? '').trim().slice(0, 20)}`),
    paddingBottomRow: getComputedStyle(row).paddingBottom,
  }
})
console.log(JSON.stringify(info, null, 2))
await browser.close()
