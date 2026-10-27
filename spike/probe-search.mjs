import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const axeSource = await readFile(new URL('../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8')
const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1180, height: 900 }, deviceScaleFactor: 2 })).newPage()
const errors = []
page.on('pageerror', (error) => errors.push(String(error)))
await page.goto('http://127.0.0.1:4319/')
await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
await page.getByRole('button', { name: /open padd/i }).click()
await page.locator('.documents').waitFor()
await page.waitForTimeout(500)

const count = async () => page.locator('.documents__item').count()
const all = await count()
await page.getByLabel('Search documents').fill('ghost')
await page.waitForTimeout(300)
const ghosts = { rows: await count(), title: await page.locator('.documents__title').first().innerText() }
await page.screenshot({ path: 'screenshots/search-filtered.png' })

await page.getByLabel('Search documents').fill('zzzz')
await page.waitForTimeout(300)
const none = { rows: await count(), empty: await page.locator('.documents__empty').innerText() }
await page.screenshot({ path: 'screenshots/search-empty.png' })

await page.getByRole('button', { name: 'Clear search' }).click()
await page.waitForTimeout(300)
const cleared = await count()

// Hover inset: the tint must start inside the panel, not at its edge.
await page.locator('.documents__item').first().hover()
await page.waitForTimeout(200)
const hover = await page.evaluate(() => {
  const item = document.querySelector('.documents__item')
  const row = item.querySelector('.documents__row')
  const title = item.querySelector('.documents__title')
  const panel = document.querySelector('.page')
  const itemRect = item.getBoundingClientRect()
  const panelRect = panel.getBoundingClientRect()
  return {
    background: getComputedStyle(item).backgroundColor,
    tintInsetFromPanel: Math.round(itemRect.left - panelRect.left),
    textInsetFromPanel: Math.round(title.getBoundingClientRect().left - panelRect.left),
    textInsetFromTint: Math.round(title.getBoundingClientRect().left - itemRect.left),
    radius: getComputedStyle(item).borderRadius,
  }
})
await page.screenshot({ path: 'screenshots/list-hover.png', clip: { x: 250, y: 100, width: 700, height: 300 } })

await page.addScriptTag({ content: axeSource })
const violations = await page.evaluate(async () => {
  const run = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } })
  return run.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)
})

console.log(JSON.stringify({ all, ghosts, none, cleared, hover, violations, errors }, null, 2))
await browser.close()
