/** Demo screenshots: a chip, a card, and the phone view. Throwaway. */
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
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 })
const page = await context.newPage()
const problems = []
page.on('pageerror', (error) => problems.push(String(error)))
page.on('console', (message) => {
  if (message.type() === 'error') problems.push(message.text())
})

await page.goto(`${ORIGIN}/d/${slug}`)
await page.locator('input[type="password"]').waitFor()
await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD ?? '')
await page.getByRole('button', { name: /open padd/i }).click()
await page.locator('.prose h1').waitFor()
await page.waitForTimeout(1200)

const created = await fetch(`${ORIGIN}/api/documents/${slug}/suggestions`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${env.PADDO_TOKEN}` },
  body: JSON.stringify({
    edits: [
      {
        original: 'Headers are doors.',
        proposed: 'Headers are doors, and a blockquote is the room behind them.',
        rationale: 'Extends the metaphor instead of dropping it.',
      },
      {
        original: 'That is the whole promise, really.',
        proposed:
          'That is the whole promise, really, and it is a smaller one than the industry would have you believe: fewer interruptions between the person and the paragraph, nothing more, nothing louder.',
        rationale: 'Lands the piece on a claim rather than a shrug.',
      },
    ],
  }),
}).then((response) => response.json())
console.log('created suggestions:', created.created?.length, created.errors)

await page.locator('.sug-chip').first().waitFor()

await page.locator('.sug-chip').first().scrollIntoViewIfNeeded()
await page.waitForTimeout(400)
await page.screenshot({ path: 'screenshots/suggestion-chip.png' })

await page.locator('.sug-card').first().scrollIntoViewIfNeeded()
await page.waitForTimeout(400)
await page.screenshot({ path: 'screenshots/suggestion-card.png' })

const phone = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  storageState: await context.storageState(),
})
const phonePage = await phone.newPage()
await phonePage.goto(`${ORIGIN}/d/${slug}`)
await phonePage.locator('.sug-card').first().waitFor({ timeout: 15_000 })
await phonePage.locator('.sug-card').first().scrollIntoViewIfNeeded()
await phonePage.waitForTimeout(600)
await phonePage.screenshot({ path: 'screenshots/suggestion-phone.png' })

const targets = await phonePage.evaluate(() =>
  [...document.querySelectorAll('.sug-action, .bottombar .button, .topbar .button')].map((node) => {
    const rect = node.getBoundingClientRect()
    return { label: (node.textContent ?? '').trim(), w: Math.round(rect.width), h: Math.round(rect.height) }
  }),
)

console.log('phone control sizes:', JSON.stringify(targets))
console.log('console problems:', problems.slice(0, 4))

// Leave the document clean for a first look.
for (const suggestion of created.created ?? []) {
  await fetch(`${ORIGIN}/api/documents/${slug}/suggestions/${suggestion.id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${env.PADDO_TOKEN}` },
    body: JSON.stringify({ status: 'rejected' }),
  })
}

await browser.close()
