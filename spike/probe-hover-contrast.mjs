/** Contrast of the meta line with the row's hover tint applied. */
import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const axeSource = await readFile(new URL('../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8')
const browser = await chromium.launch()
for (const scheme of ['light', 'dark']) {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 }, colorScheme: scheme })).newPage()
  await page.goto('http://127.0.0.1:4319/')
  await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
  await page.getByRole('button', { name: /open padd/i }).click()
  await page.locator('.documents').waitFor()
  await page.waitForTimeout(400)
  await page.locator('.documents__item').first().hover()
  await page.waitForTimeout(300)
  await page.addScriptTag({ content: axeSource })
  const violations = await page.evaluate(async () => {
    const run = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } })
    return run.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)
  })
  console.log(scheme, JSON.stringify(violations))
  await page.close()
}
await browser.close()
