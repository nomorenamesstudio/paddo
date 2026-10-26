import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
const page = await context.newPage()
const errors = []
page.on('pageerror', (error) => errors.push(String(error)))
page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`) })

await page.goto('http://127.0.0.1:4319/d/new-draft-6')
await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
await page.getByRole('button', { name: /open padd/i }).click()
await page.locator('.prose h1').first().waitFor()
await page.waitForTimeout(1600)

const before = await page.evaluate(() => ({
  pending: document.querySelector('.bottombar__count')?.textContent,
  hunks: document.querySelectorAll('.sug-hunk').length,
}))

const bar = await page.locator('.bottombar').boundingBox()
const acceptAll = page.getByRole('button', { name: 'Accept all' })
const rejectAll = page.getByRole('button', { name: 'Reject all' })
const geometry = {
  bar,
  acceptAll: await acceptAll.boundingBox(),
  rejectAll: await rejectAll.boundingBox(),
  viewport: page.viewportSize(),
}

// Is something covering the buttons?
const covers = await page.evaluate(() => {
  const button = [...document.querySelectorAll('.bottombar .button')].find((b) => b.textContent.includes('Accept all'))
  const rect = button.getBoundingClientRect()
  const top = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
  return { topElement: top?.tagName, topClass: top?.className?.toString().slice(0, 60), sameButton: top === button }
})

await acceptAll.click()
await page.waitForTimeout(800)
const afterAccept = await page.evaluate(() => ({
  bar: document.querySelectorAll('.bottombar').length,
  pending: document.querySelector('.bottombar__count')?.textContent ?? null,
  text: window.__paddo.editor.getText().slice(-120),
}))

console.log(JSON.stringify({ before, geometry, covers, afterAccept, errors }, null, 2))
await browser.close()
