/** axe on the surfaces he actually uses, in both themes. */
import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'

const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const axeSource = await readFile(new URL('../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8')

const browser = await chromium.launch()
const results = []

for (const scheme of ['light', 'dark']) {
  const context = await browser.newContext({ viewport: { width: 1180, height: 900 }, colorScheme: scheme })
  const page = await context.newPage()
  await page.goto('http://127.0.0.1:4319/')
  await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
  await page.getByRole('button', { name: /open padd/i }).click()
  await page.locator('.documents').waitFor()
  await page.waitForTimeout(600)
  // Follow the OS choice for this pass, so both palettes get audited.
  await page.evaluate(() => localStorage.setItem('paddo-theme', 'system'))

  const audit = async (label) => {
    await page.addScriptTag({ content: axeSource })
    const report = await page.evaluate(async () => {
      const run = await window.axe.run(document, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] },
      })
      return run.violations.map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        help: violation.help,
        nodes: violation.nodes.slice(0, 3).map((node) => ({
          target: node.target.join(' '),
          summary: (node.failureSummary ?? '').split('\n').slice(1, 3).join(' '),
        })),
      }))
    })
    results.push({ scheme, label, report })
    console.log(`${scheme} ${label}: ${report.length ? report.map((v) => `${v.id}(${v.nodes.length})`).join(', ') : 'clean'}`)
  }

  await audit('documents')
  await page.goto('http://127.0.0.1:4319/settings')
  await page.locator('.settings__themes').waitFor()
  await page.waitForTimeout(500)
  await audit('settings')
  await page.goto('http://127.0.0.1:4319/d/the-ghosted-story')
  await page.locator('.prose h1').first().waitFor()
  await page.waitForTimeout(1500)
  await audit('editor with hunks')
  await page.locator('.editor-menu__trigger').click()
  await page.getByRole('menuitem', { name: 'Invite the agent' }).click()
  await page.locator('.sheet').waitFor()
  await page.waitForTimeout(500)
  await audit('invite sheet')
  await context.close()
}

await browser.close()
const failures = results.filter((entry) => entry.report.length > 0)
console.log('\ndetails:')
for (const entry of failures) {
  for (const violation of entry.report) {
    console.log(`- [${entry.scheme}] ${entry.label}: ${violation.id} (${violation.impact})`)
    for (const node of violation.nodes) console.log(`    ${node.target}\n      ${node.summary}`)
  }
}
