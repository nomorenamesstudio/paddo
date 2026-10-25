/** Verify: ghosts are pruned, a live hunk accepts, and nothing fails silently. */
import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'

const ORIGIN = 'http://127.0.0.1:4319'
const slug = 'the-quiet-interface'
const env = Object.fromEntries(
  (await readFile(new URL('../.env', import.meta.url), 'utf8'))
    .split('\n')
    .filter((line) => line.includes('='))
    .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
)

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1100, height: 900 }, colorScheme: 'dark', deviceScaleFactor: 2 })
const page = await context.newPage()
page.on('pageerror', (error) => console.log('[pageerror]', String(error)))
page.on('console', (message) => {
  if (message.type() === 'error') console.log('[console.error]', message.text())
})

await page.goto(`${ORIGIN}/d/${slug}`)
await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD ?? '')
await page.getByRole('button', { name: /open padd/i }).click()
await page.locator('.prose h1').waitFor()
await page.waitForTimeout(2600)

const afterPrune = await page.evaluate(() => ({
  mapSize: window.__paddo.collab.doc.getMap('suggestions').size,
  chips: document.querySelectorAll('.sug-chip, .sug-card').length,
}))

await fetch(`${ORIGIN}/api/documents/${slug}/suggestions`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${env.PADDO_TOKEN}` },
  body: JSON.stringify({
    edits: [
      {
        original: 'Headers are doors.',
        proposed: 'Headers are doors, and a blockquote is the room behind them.',
        rationale: 'Extends the metaphor.',
      },
    ],
  }),
})

await page.locator('.sug-chip').first().waitFor({ timeout: 10_000 })
await page.locator('.sug-chip').first().scrollIntoViewIfNeeded()
await page.waitForTimeout(300)
await page.screenshot({ path: 'screenshots/chip-dark.png' })

await page.locator('.sug-chip .sug-action').first().click()
await page.waitForTimeout(1200)

const afterAccept = await page.evaluate(() => ({
  mapSize: window.__paddo.collab.doc.getMap('suggestions').size,
  edited: window.__paddo.editor.getText().includes('a blockquote is the room behind them'),
  notice: document.querySelector('.notice')?.textContent?.trim() ?? null,
}))

await page.waitForTimeout(2000)
const file = await readFile(new URL(`../content/${slug}.md`, import.meta.url), 'utf8')

console.log(JSON.stringify({ afterPrune, afterAccept, inFile: file.includes('a blockquote is the room behind them') }, null, 2))
await browser.close()
