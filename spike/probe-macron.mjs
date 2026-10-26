/** Does the macron in "Paddō" come from the webfont, in both families? */
import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1180, height: 860 }, deviceScaleFactor: 3 })).newPage()
const fontRequests = []
page.on('request', (request) => {
  if (request.url().includes('/fonts/')) fontRequests.push(request.url().split('/fonts/')[1])
})
await page.goto('http://127.0.0.1:4319/')
await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
await page.getByRole('button', { name: /open padd/i }).click()
await page.locator('.documents').waitFor()
await page.waitForTimeout(1200)

const report = await page.evaluate(async () => {
  await document.fonts.ready
  const checks = {
    displayMacron: document.fonts.check('1rem "Young Serif"', 'ō'),
    displayPlain: document.fonts.check('1rem "Young Serif"', 'o'),
    bodyMacron: document.fonts.check('1rem "Source Serif 4"', 'ō'),
    bodyEmMacron: document.fonts.check('italic 1rem "Source Serif 4"', 'ō'),
  }
  const faces = [...document.fonts].map((face) => `${face.family} ${face.style} ${face.status}`)
  // Measure the wordmark with and without the macron: identical width would mean
  // the ō is being drawn from a fallback with the same metrics.
  const mark = document.querySelector('.wordmark')
  const measure = (text) => {
    const probe = document.createElement('span')
    probe.style.cssText = `font-family:${getComputedStyle(mark).fontFamily};font-size:64px;position:absolute;visibility:hidden`
    probe.textContent = text
    document.body.append(probe)
    const width = probe.getBoundingClientRect().width
    probe.remove()
    return Math.round(width * 10) / 10
  }
  return { checks, faces, widths: { Paddo: measure('Paddo'), 'Paddō': measure('Paddō') } }
})
await page.screenshot({ path: 'screenshots/wordmark-final.png', clip: { x: 240, y: 20, width: 260, height: 90 } })
console.log(JSON.stringify({ ...report, fontRequests }, null, 2))
await browser.close()
