import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const axeSource = await readFile(new URL('../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8')
const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage()
await page.goto('http://127.0.0.1:4321/')
await page.locator('input[type="password"]').fill('paddo-test-password')
await page.getByRole('button', { name: /open padd/i }).click()
await page.locator('.documents').waitFor()
await page.waitForTimeout(600)
const styles = await page.evaluate(() => {
  const meta = document.querySelector('.documents__meta')
  const row = document.querySelector('.documents__item')
  const style = getComputedStyle(meta)
  return {
    metaColor: style.color,
    metaOpacity: getComputedStyle(meta).opacity,
    rowColor: getComputedStyle(row).color,
    rowOpacity: getComputedStyle(row).opacity,
    muted: getComputedStyle(document.documentElement).getPropertyValue('--muted'),
    rowBg: getComputedStyle(row).backgroundColor,
    fontFamily: style.fontFamily,
  }
})
await page.addScriptTag({ content: axeSource })
const violations = await page.evaluate(async () => {
  const run = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } })
  return run.violations.map((v) => `${v.id}: ${v.nodes.length} — ${v.nodes[0]?.any?.[0]?.message ?? ''}`)
})
console.log(JSON.stringify({ styles, violations }, null, 1))
await browser.close()
