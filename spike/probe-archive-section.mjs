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

// Archive one throwaway so the section has something in it.
const slug = await page.evaluate(async () => {
  const created = await (await fetch('/api/documents', { method: 'POST' })).json()
  await fetch(`/api/documents/${created.slug}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'archived' }),
  })
  return created.slug
})
await page.reload()
await page.locator('.documents').waitFor()
await page.waitForTimeout(400)

const collapsed = await page.evaluate(() => {
  const details = document.querySelector('.archive')
  return {
    exists: Boolean(details),
    open: details?.open ?? null,
    summary: details?.querySelector('summary')?.textContent?.replace(/\s+/g, ' ').trim(),
    archivedRowsVisible: [...document.querySelectorAll('.archive__list .documents__item')].filter(
      (row) => row.getBoundingClientRect().height > 0,
    ).length,
  }
})
await page.screenshot({ path: 'screenshots/archive-collapsed.png' })

await page.locator('.archive__summary').click()
await page.waitForTimeout(350)
const expanded = await page.evaluate(() => {
  const details = document.querySelector('.archive')
  return {
    open: details?.open ?? null,
    archivedRowsVisible: [...document.querySelectorAll('.archive__list .documents__item')].filter(
      (row) => row.getBoundingClientRect().height > 0,
    ).length,
    firstArchived: document.querySelector('.archive__list .documents__title')?.textContent,
  }
})
await page.screenshot({ path: 'screenshots/archive-open.png' })

// Clean up: back to draft, then delete the throwaway.
await page.evaluate(async (target) => {
  await fetch(`/api/documents/${target}`, { method: 'DELETE' })
}, slug)

console.log(JSON.stringify({ slug, collapsed, expanded, errors }, null, 2))
await browser.close()
