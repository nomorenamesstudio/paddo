/** Reject any suggestion that carries no text: those are the "ghost edits". */
import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const env = Object.fromEntries((await readFile('.env', 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const browser = await chromium.launch()
const page = await (await browser.newContext()).newPage()
await page.goto('http://127.0.0.1:4319/')
await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
await page.getByRole('button', { name: /open padd/i }).click()
await page.locator('.documents').waitFor()

const report = await page.evaluate(async () => {
  const list = await (await fetch('/api/documents')).json()
  const dropped = []
  for (const doc of list.documents) {
    const pending = await (await fetch(`/api/documents/${doc.slug}/suggestions`)).json()
    for (const suggestion of pending.suggestions) {
      const blank = !(suggestion.original ?? '').trim() && !(suggestion.proposed ?? '').trim()
      if (!blank) continue
      await fetch(`/api/documents/${doc.slug}/suggestions/${suggestion.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'rejected' }),
      })
      dropped.push(`${doc.slug}: ${JSON.stringify(suggestion.original)} → ${JSON.stringify(suggestion.proposed)}`)
    }
  }
  const after = await (await fetch('/api/documents')).json()
  const counts = []
  for (const doc of after.documents) {
    const pending = await (await fetch(`/api/documents/${doc.slug}/suggestions`)).json()
    counts.push(`${doc.slug}: ${pending.suggestions.length}`)
  }
  return { dropped, counts }
})
console.log(JSON.stringify(report, null, 2))
await browser.close()
