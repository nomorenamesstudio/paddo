/** axe against the *fixture* content the e2e suite uses. */
import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const axeSource = await readFile(new URL('../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8')
const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage()
await page.goto('http://127.0.0.1:4319/')
await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
await page.getByRole('button', { name: /open padd/i }).click()
await page.locator('.documents').waitFor()
await page.waitForTimeout(400)
await page.addScriptTag({ content: axeSource })
const report = await page.evaluate(async () => {
  const run = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } })
  return run.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n) => ({ target: n.target.join(' '), summary: (n.failureSummary ?? '').replace(/\n/g, ' | ') })) }))
})
console.log(JSON.stringify(report, null, 1).slice(0, 2500))
await browser.close()
