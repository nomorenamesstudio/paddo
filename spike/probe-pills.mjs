import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1180, height: 860 }, deviceScaleFactor: 2 })
const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto('http://127.0.0.1:4319/')
await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
await page.getByRole('button', { name: /open padd/i }).click()
await page.locator('.documents').waitFor()
await page.waitForTimeout(500)
await page.screenshot({ path: 'screenshots/pills-home.png', clip: { x: 220, y: 20, width: 760, height: 300 } })

const radii = await page.evaluate(() => {
  const radius = (selector) => {
    const node = document.querySelector(selector)
    return node ? getComputedStyle(node).borderRadius : null
  }
  return {
    plus: radius('.masthead--row .button--icon'),
    kebab: radius('.row-menu__trigger'),
  }
})

// A suggestion, so the chip and card buttons show too.
await page.evaluate(() => fetch('/api/documents', { method: 'POST' }))
await page.goto('http://127.0.0.1:4319/d/the-quiet-interface')
await page.locator('.prose h1').first().waitFor()
await page.waitForTimeout(1200)
const created = await page.evaluate(async () => {
  const response = await fetch('/api/documents/the-quiet-interface/suggestions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ edits: [{ original: 'Headers are doors.', proposed: 'Headers are doorways.', rationale: 'Rounder.' }] }),
  })
  return (await response.json()).created?.map((entry) => entry.id) ?? []
})
await page.locator('.sug-chip').first().waitFor({ timeout: 8000 })
const chipRadii = await page.evaluate(() => ({
  chip: getComputedStyle(document.querySelector('.sug-chip')).borderRadius,
  action: getComputedStyle(document.querySelector('.sug-action')).borderRadius,
  topbar: getComputedStyle(document.querySelector('.status .button--icon')).borderRadius,
  back: getComputedStyle(document.querySelector('.topbar__back')).borderRadius,
}))
await page.screenshot({ path: 'screenshots/pills-editor.png' })

// Clean the suggestion up.
for (const id of created) {
  await page.evaluate((suggestionId) => fetch(`/api/documents/the-quiet-interface/suggestions/${suggestionId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'rejected' }),
  }), id)
}
console.log(JSON.stringify({ radii, chipRadii, errors }, null, 2))
await browser.close()
