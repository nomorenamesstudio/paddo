import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1180, height: 900 }, deviceScaleFactor: 2 })).newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto('http://127.0.0.1:4319/')
await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
await page.getByRole('button', { name: /open padd/i }).click()
await page.locator('.documents').waitFor()

const slug = await page.evaluate(async () => {
  const created = await (await fetch('/api/documents', { method: 'POST' })).json()
  await fetch(`/api/documents/${created.slug}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'archived' }),
  })
  return created.slug
})
await page.reload()
await page.locator('.archive__summary').click()
const row = page.locator(`.archive__list .documents__item:has(a[href="/d/${slug}"])`)
await row.locator('.row-menu__trigger').click()
const items = await page.locator('.row-menu__item').allInnerTexts()
await page.screenshot({ path: 'screenshots/restore-menu.png' })

await page.locator('.row-menu__item', { hasText: 'Restore' }).click()
await page.waitForTimeout(900)
const state = await page.evaluate(async (target) => {
  const body = await (await fetch('/api/documents')).json()
  const doc = body.documents.find((d) => d.slug === target)
  return { status: doc?.status, inActiveList: Boolean(document.querySelector(`.documents .documents__item a[href="/d/${target}"]`)) }
}, slug)
await page.evaluate((target) => fetch(`/api/documents/${target}`, { method: 'DELETE' }), slug)
console.log(JSON.stringify({ slug, items, state, errors }, null, 2))
await browser.close()
