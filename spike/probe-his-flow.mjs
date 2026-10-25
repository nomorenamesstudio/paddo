/** Walk his actual flow: list → open his own document → type → propose → accept. */
import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'

const ORIGIN = 'http://127.0.0.1:4319'
const env = Object.fromEntries(
  (await readFile(new URL('../.env', import.meta.url), 'utf8'))
    .split('\n')
    .filter((line) => line.includes('='))
    .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
)

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1280, height: 880 }, deviceScaleFactor: 2 })
const page = await context.newPage()
const log = []
page.on('pageerror', (error) => log.push(`pageerror: ${error}`))
page.on('console', (message) => {
  if (message.type() === 'error') log.push(`console: ${message.text()}`)
})

await page.goto(ORIGIN)
await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD ?? '')
await page.getByRole('button', { name: /open padd/i }).click()
await page.locator('.documents').waitFor()

const rows = await page.locator('.documents__row').allInnerTexts()
console.log('documents listed:', JSON.stringify(rows))

// Open the second document, the one he wrote.
const target = page.locator('.documents__row', { hasText: 'Wow this cool' })
await target.click()
await page.locator('.prose').waitFor()
await page.waitForTimeout(1500)

const state = await page.evaluate(() => {
  const editor = window.__paddo?.editor
  return {
    url: location.pathname,
    hasEditor: Boolean(editor),
    editable: editor?.isEditable,
    text: editor?.getText().slice(0, 120),
    proseHtmlLength: editor?.getHTML().length,
    sync: document.querySelector('.sync')?.textContent,
    chips: document.querySelectorAll('.sug-chip, .sug-card').length,
  }
})

// Type at the end of his paragraph.
await page.locator('.prose p').last().click()
await page.keyboard.type(' Typed on the desktop.')
await page.waitForTimeout(2500)

const afterTyping = await page.evaluate(() => window.__paddo.editor.getText().includes('Typed on the desktop.'))

const propose = await fetch(`${ORIGIN}/api/documents/wow-this-cool/suggestions`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${env.PADDO_TOKEN}` },
  body: JSON.stringify({
    edits: [
      {
        original: 'cool way to put my thoughts',
        proposed: 'good way to put my thoughts',
        rationale: 'Less of a hedge.',
      },
    ],
  }),
}).then((response) => response.json())

await page.waitForTimeout(1200)
const chips = await page.locator('.sug-chip, .sug-card').count()
if (chips > 0) {
  await page.locator('.sug-chip .sug-action').first().click()
  await page.waitForTimeout(1500)
}
const afterAccept = await page.evaluate(() => ({
  accepted: window.__paddo.editor.getText().includes('good way to put my thoughts'),
  mapSize: window.__paddo.collab.doc.getMap('suggestions').size,
}))
await page.screenshot({ path: 'screenshots/his-document.png' })

console.log(JSON.stringify({ state, afterTyping, propose, chips, afterAccept, log }, null, 2))
await browser.close()
