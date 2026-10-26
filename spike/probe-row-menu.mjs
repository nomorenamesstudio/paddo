/** Kebab menu: archive a document, delete a throwaway one. */
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

// A throwaway document for the delete path.
const slug = await page.evaluate(async () => {
  const response = await fetch('/api/documents', { method: 'POST' })
  return (await response.json()).slug
})
await page.reload()
await page.locator('.documents').waitFor()
await page.waitForTimeout(400)

const rows = page.locator('.documents__item')
console.log('rows before:', await rows.count())

// Archive "The quiet interface".
const quiet = rows.filter({ hasText: 'The quiet interface' })
await quiet.locator('.row-menu__trigger').click()
await page.locator('.row-menu__panel').waitFor()
const items = await page.locator('.row-menu__item').allInnerTexts()
await page.screenshot({ path: 'screenshots/row-menu.png' })
await page.locator('.row-menu__item', { hasText: 'Archive' }).click()
await page.waitForTimeout(900)
const quietStatus = await page.evaluate(async () => {
  const body = await (await fetch('/api/documents')).json()
  return body.documents.find((d) => d.slug === 'the-quiet-interface')?.status
})

// Delete the throwaway: first click asks, second deletes.
const draft = page.locator(`.documents__item:has(a[href="/d/${slug}"])`)
await draft.locator('.row-menu__trigger').click()
await page.locator('.row-menu__item', { hasText: 'Delete' }).click()
await page.waitForTimeout(200)
const asking = await page.locator('.row-menu__item--danger.is-confirming').innerText()
await page.locator('.row-menu__item--danger.is-confirming').click()
await page.waitForTimeout(1200)
const rowsAfter = await rows.count()
const draftGone = await page.evaluate(async (target) => {
  const body = await (await fetch('/api/documents')).json()
  return !body.documents.some((d) => d.slug === target)
}, slug)

// Put the archived fixture back the way it was.
await page.evaluate(async () => {
  await fetch('/api/documents/the-quiet-interface', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'editing' }),
  })
})

console.log(JSON.stringify({ slug, items, quietStatus, asking, rowsAfter, draftGone, errors }, null, 2))
await browser.close()
