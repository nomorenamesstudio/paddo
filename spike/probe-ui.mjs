/**
 * Browser smoke pass against the running server: sign in, open a document,
 * type, receive a suggestion from the API, accept it, and look at it on a phone
 * viewport.
 *
 * Throwaway verification, not a test.
 */
import { readFile } from 'node:fs/promises'

import { chromium } from '@playwright/test'

const ORIGIN = process.env.PADDO_ORIGIN ?? 'http://127.0.0.1:4319'
const env = Object.fromEntries(
  (await readFile(new URL('../.env', import.meta.url), 'utf8'))
    .split('\n')
    .filter((line) => line.includes('='))
    .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
)

const slug = 'the-quiet-interface'
const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 2 })
const page = await context.newPage()

const problems = []
page.on('console', (message) => {
  if (message.type() === 'error') problems.push(message.text())
})
page.on('pageerror', (error) => problems.push(String(error)))

await page.goto(ORIGIN)

// --- sign in ---------------------------------------------------------------
await page.locator('input[type="password"]').waitFor({ timeout: 10_000 })
await page.locator('input[type="password"]').fill('definitely-wrong')
await page.getByRole('button', { name: /open padd/i }).click()
await page.waitForTimeout(600)
const wrongPasswordRefused = await page.locator('.notice--error').isVisible()

await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD ?? '')
await page.getByRole('button', { name: /open padd/i }).click()
await page.locator('.documents').waitFor({ timeout: 10_000 })

// --- open the document -----------------------------------------------------
await page.locator('.documents__row').first().click()
await page.locator('.prose h1').waitFor({ timeout: 10_000 })
const headingLoaded = (await page.locator('.prose h1').first().innerText()).trim()
const syncLabel = (await page.locator('.sync').innerText()).trim()

// --- type ------------------------------------------------------------------
const lastParagraph = page.locator('.prose p').last()
await lastParagraph.click()
await page.keyboard.press('End')
const typed = ' Typed live in the browser.'
await page.keyboard.type(typed, { delay: 12 })
await page.waitForTimeout(2500)

const saved = await readFile(new URL(`../content/${slug}.md`, import.meta.url), 'utf8')
const typedPersisted = saved.includes(typed.trim())

// --- a suggestion arrives from the agent -----------------------------------
const propose = await fetch(`${ORIGIN}/api/documents/${slug}/suggestions`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${env.PADDO_TOKEN}` },
  body: JSON.stringify({
    edits: [
      {
        original: 'Most software fights this moment.',
        proposed: 'Most software fights this moment, and loses.',
        rationale: 'Sharpens the claim and gives the paragraph a harder turn.',
      },
      {
        original: 'That is the whole promise, really.',
        proposed:
          'That is the whole promise, really, and it is a smaller one than the industry would have you believe: fewer interruptions between the person and the paragraph, nothing more, nothing louder.',
        rationale: 'A longer rewrite, so it should render as a card rather than a chip.',
      },
    ],
  }),
}).then((response) => response.json())

await page.locator('.sug-card, .sug-chip').first().waitFor({ timeout: 10_000 })
const chipCount = await page.locator('.sug-chip').count()
const cardCount = await page.locator('.sug-card').count()
const pendingLabel = (await page.locator('.bottombar__count').innerText()).trim()

await page.screenshot({ path: 'screenshots/editor-desktop.png', fullPage: false })

// --- accept the first hunk -------------------------------------------------
const chipsBefore = await page.locator('.sug-chip').count()
await page.locator('.sug-chip .sug-action').first().click()

// The editor text is the honest check; the DOM also holds the unaccepted chips.
let acceptedApplied = false
let acceptedInFile = false
for (let attempt = 0; attempt < 30; attempt += 1) {
  await page.waitForTimeout(400)
  acceptedApplied = await page.evaluate(() =>
    Boolean(window.__paddo?.editor?.getText().includes('and loses')),
  )
  const file = await readFile(new URL(`../content/${slug}.md`, import.meta.url), 'utf8')
  acceptedInFile = file.includes('and loses')
  if (acceptedApplied && acceptedInFile) break
}
const chipsAfter = await page.locator('.sug-chip').count()

await page.screenshot({ path: 'screenshots/editor-after-accept.png' })

// --- phone viewport --------------------------------------------------------
const phone = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  storageState: await context.storageState(),
})
const phonePage = await phone.newPage()
await phonePage.goto(`${ORIGIN}/d/${slug}`)
await phonePage.locator('.prose h1').waitFor({ timeout: 10_000 })
await phonePage.waitForTimeout(1200)

const smallTargets = await phonePage.evaluate(() => {
  const nodes = [...document.querySelectorAll('.sug-action, .bottombar .button')]
  return nodes
    .map((node) => {
      const rect = node.getBoundingClientRect()
      return { label: (node.textContent ?? '').trim(), width: Math.round(rect.width), height: Math.round(rect.height) }
    })
    .filter((box) => box.height < 44 || box.width < 44)
})

await phonePage.screenshot({ path: 'screenshots/editor-phone.png', fullPage: false })

console.log(
  JSON.stringify(
    {
      wrongPasswordRefused,
      headingLoaded,
      syncLabel,
      typedPersisted,
      proposeCreated: propose.created?.length ?? 0,
      proposeErrors: propose.errors,
      chipCount,
      cardCount,
      pendingLabel,
      acceptedApplied,
      acceptedInFile,
      chipsBefore,
      chipsAfter,
      mapSizeAfterAccept: await page.evaluate(() => window.__paddo.collab.doc.getMap('suggestions').size),
      smallTargets,
      consoleErrors: problems.slice(0, 6),
    },
    null,
    2,
  ),
)

await browser.close()
