/** Inspect why suggestion decorations are not rendering. Throwaway. */
import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'

const ORIGIN = 'http://127.0.0.1:4319'
const env = Object.fromEntries(
  (await readFile(new URL('../.env', import.meta.url), 'utf8'))
    .split('\n')
    .filter((line) => line.includes('='))
    .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
)

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 960 } })
const page = await context.newPage()
page.on('console', (message) => console.log(`[console.${message.type()}]`, message.text()))
page.on('pageerror', (error) => console.log('[pageerror]', String(error)))

await page.goto(ORIGIN)
await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD ?? '')
await page.getByRole('button', { name: /open padd/i }).click()
await page.locator('.documents__row').first().click()
await page.locator('.prose h1').waitFor({ timeout: 10_000 })
await page.waitForTimeout(1500)

const report = await page.evaluate(async () => {
  const handle = window.__paddo
  if (!handle) return { error: 'no debug handle' }

  const diagnostics = window.__paddoDiagnostics?.()
  const html = document.querySelector('.prose')?.innerHTML ?? ''
  return {
    diagnostics,
    decorationsInDom: {
      strike: document.querySelectorAll('.sug-strike').length,
      chip: document.querySelectorAll('.sug-chip').length,
      card: document.querySelectorAll('.sug-card').length,
    },
    sample: html.slice(0, 500),
  }
})

console.log(JSON.stringify(report, null, 2))
await browser.close()
