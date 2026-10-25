/** Focused check: does accepting a chip actually change the CRDT and the file? */
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
const context = await browser.newContext({ viewport: { width: 1440, height: 960 } })
const page = await context.newPage()
page.on('pageerror', (error) => console.log('[pageerror]', String(error)))
page.on('console', (message) => {
  if (message.type() === 'error') console.log('[console.error]', message.text())
})

await page.goto(`${ORIGIN}/d/${slug}`)
await page.locator('input[type="password"]').waitFor()
await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD ?? '')
await page.getByRole('button', { name: /open padd/i }).click()
await page.locator('.prose h1').waitFor({ timeout: 15_000 })
await page.waitForTimeout(1500)

const propose = await fetch(`${ORIGIN}/api/documents/${slug}/suggestions`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${env.PADDO_TOKEN}` },
  body: JSON.stringify({
    edits: [
      {
        original: 'Most software fights this moment.',
        proposed: 'Most software fights this moment, and loses.',
        rationale: 'Probe.',
      },
    ],
  }),
}).then((response) => response.json())
console.log('proposed:', JSON.stringify(propose).slice(0, 160))

await page.locator('.sug-chip').first().waitFor({ timeout: 10_000 })

const before = await page.evaluate(() => {
  const handle = window.__paddo
  return {
    yText: handle.collab.doc.getXmlFragment('content').toString().includes('and loses'),
    mapSize: handle.collab.doc.getMap('suggestions').size,
  }
})

const loaded = await page.evaluate(() => ({
  scripts: [...document.querySelectorAll('script[src]')].map((s) => s.getAttribute('src')),
  hasPaddo: typeof window.__paddo,
  hasDiagnostics: typeof window.__paddoDiagnostics,
  hasAccept: typeof window.__paddoAccept,
}))
console.log('loaded:', JSON.stringify(loaded))

const direct = await page.evaluate(() => {
  const handle = window.__paddo
  const first = [...handle.collab.doc.getMap('suggestions').values()][0]
  if (!first) return 'no suggestion'
  const result = window.__paddoAccept(first.id)
  return { id: first.id, result }
})
console.log('direct accept:', JSON.stringify(direct))
await page.waitForTimeout(400)

const after = await page.evaluate(() => {
  const handle = window.__paddo
  return {
    yText: handle.collab.doc.getXmlFragment('content').toString().includes('and loses'),
    mapSize: handle.collab.doc.getMap('suggestions').size,
    editorText: handle.editor.getText().includes('and loses'),
    diagnostics: window.__paddoDiagnostics(),
  }
})

await page.waitForTimeout(2500)
const file = await readFile(new URL(`../content/${slug}.md`, import.meta.url), 'utf8')

console.log(JSON.stringify({ before, after, fileHasIt: file.includes('and loses') }, null, 2))
await browser.close()
