import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1180, height: 800 } })).newPage()
await page.goto('http://127.0.0.1:4319/')
await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
await page.getByRole('button', { name: /open padd/i }).click()
await page.locator('.documents').waitFor()
await page.goto('http://127.0.0.1:4319/d/the-ghosted-story')
await page.locator('.prose p').first().waitFor()
await page.waitForTimeout(900)
const m = await page.evaluate(() => {
  const p = document.querySelector('.prose p')
  const h1 = document.querySelector('.prose h1')
  const editor = document.querySelector('.editor')
  const cs = getComputedStyle(p)
  const hs = getComputedStyle(h1)
  const es = getComputedStyle(editor)
  return {
    p: { fontSize: cs.fontSize, lineHeight: cs.lineHeight, marginTop: cs.marginTop, marginBottom: cs.marginBottom, fontFamily: cs.fontFamily.split(',')[0] },
    h1: { marginBottom: hs.marginBottom, fontSize: hs.fontSize },
    editor: { padding: es.padding },
    pRect: p.getBoundingClientRect().toJSON(),
    h1Rect: h1.getBoundingClientRect().toJSON(),
  }
})
console.log(JSON.stringify(m, null, 1))
await browser.close()
