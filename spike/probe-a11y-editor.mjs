import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const axeSource = await readFile(new URL('../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8')
const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1180, height: 900 } })).newPage()
await page.goto('http://127.0.0.1:4319/')
await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
await page.getByRole('button', { name: /open padd/i }).click()
await page.locator('.documents').waitFor()
const slug = await page.evaluate(async () => {
  const created = await (await fetch('/api/documents', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Axe probe' }) })).json()
  return created.slug
})
await page.goto(`http://127.0.0.1:4319/d/${slug}`)
await page.locator('.prose h1').first().waitFor()
await page.waitForTimeout(1500)
await page.addScriptTag({ content: axeSource })
const report = await page.evaluate(async () => {
  const run = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } })
  return run.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => ({ target: n.target.join(' '), summary: (n.failureSummary ?? '').replace(/\n/g, ' | ') })) }))
})
console.log(JSON.stringify(report, null, 2))
await page.evaluate((target) => fetch(`/api/documents/${target}`, { method: 'DELETE' }), slug)
await browser.close()
