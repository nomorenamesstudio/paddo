/** The human side of the same run: review what the agent proposed. */
import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1180, height: 950 }, deviceScaleFactor: 2 })).newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto('http://127.0.0.1:4319/d/agent-test')
await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
await page.getByRole('button', { name: /open padd/i }).click()
await page.locator('.prose h1').first().waitFor()
await page.waitForTimeout(1500)

const before = await page.evaluate(() => ({
  chips: document.querySelectorAll('.sug-chip').length,
  cards: document.querySelectorAll('.sug-card').length,
  pendingLabel: document.querySelector('.bottombar__count')?.textContent,
  rationales: [...document.querySelectorAll('.sug-rationale')].map((n) => n.textContent),
}))
await page.screenshot({ path: 'screenshots/agent-review.png', fullPage: false })

// Reject the second hunk (the "second pair of eyes" rewrite), accept the rest.
const cards = page.locator('.sug-card')
if (await cards.count()) {
  await cards.first().locator('.sug-action', { hasText: 'Reject' }).click()
  await page.waitForTimeout(400)
}
const afterReject = await page.evaluate(() => ({
  cards: document.querySelectorAll('.sug-card').length,
  chips: document.querySelectorAll('.sug-chip').length,
  pendingLabel: document.querySelector('.bottombar__count')?.textContent,
}))

const acceptAll = page.getByRole('button', { name: 'Accept all' })
if (await acceptAll.count()) {
  await acceptAll.click()
  await page.waitForTimeout(600)
}
const afterAccept = await page.evaluate(() => ({
  pendingBar: document.querySelectorAll('.bottombar').length,
  text: window.__paddo.editor.getText(),
}))
await page.screenshot({ path: 'screenshots/agent-after.png' })
await page.waitForTimeout(2000)

const file = await readFile('content/agent-test.md', 'utf8')
console.log(JSON.stringify({
  before,
  afterReject,
  afterAccept: { pendingBar: afterAccept.pendingBar, firstChars: afterAccept.text.slice(0, 120) },
  file: file.trim().split('\n\n').map((p) => p.slice(0, 60)),
  errors,
}, null, 2))
await browser.close()
