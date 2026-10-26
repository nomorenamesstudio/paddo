/** Status as icons: list marks, picker button, menu. */
import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))

const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1180, height: 860 }, deviceScaleFactor: 2 })).newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto('http://127.0.0.1:4319/')
await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
await page.getByRole('button', { name: /open padd/i }).click()
await page.locator('.documents').waitFor()

const listMarks = await page.locator('.documents__status svg').evaluateAll((nodes) =>
  nodes.map((node) => node.innerHTML.slice(0, 60)),
)
await page.screenshot({ path: 'screenshots/home-icons.png' })

await page.locator('.documents__row', { hasText: 'The quiet interface' }).click()
await page.locator('.prose h1').first().waitFor()
await page.waitForTimeout(1200)

const buttonLabel = await page.locator('.status button').getAttribute('aria-label')
await page.locator('.status button').click()
await page.locator('.status__menu').waitFor()
const items = await page.locator('.status__item').evaluateAll((nodes) =>
  nodes.map((node) => ({
    text: node.textContent?.trim(),
    checked: node.getAttribute('aria-checked'),
    icons: node.querySelectorAll('svg').length,
    height: Math.round(node.getBoundingClientRect().height),
  })),
)
await page.screenshot({ path: 'screenshots/status-menu.png' })

await page.locator('.status__item', { hasText: 'Archived' }).click()
await page.waitForTimeout(700)
const afterLabel = await page.locator('.status button').getAttribute('aria-label')
const menuClosed = (await page.locator('.status__menu').count()) === 0

// Put it back to draft so the demo document is unchanged.
await page.locator('.status button').click()
await page.locator('.status__item', { hasText: 'Draft' }).click()
await page.waitForTimeout(500)

console.log(JSON.stringify({ listMarkCount: listMarks.length, buttonLabel, items, afterLabel, menuClosed, errors }, null, 2))
await browser.close()
