/** Homepage without subtitle, plus-draft flow, status picker and sync icon. */
import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1180, height: 860 }, deviceScaleFactor: 2 })
const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto('http://127.0.0.1:4319/')
await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
await page.getByRole('button', { name: /open padd/i }).click()
await page.locator('.documents').waitFor()

const home = await page.evaluate(() => ({
  wordmarkSize: getComputedStyle(document.querySelector('.wordmark')).fontSize,
  mutedParagraphs: [...document.querySelectorAll('.masthead .muted')].length,
  hasPlus: Boolean(document.querySelector('.masthead--row .button--icon')),
  rows: [...document.querySelectorAll('.documents__row')].map((row) => row.innerText.replace(/\n/g, ' | ')),
}))
await page.screenshot({ path: 'screenshots/home.png' })

// New draft from the plus.
await page.locator('.masthead--row .button--icon').click()
await page.locator('.prose h1').first().waitFor()
await page.waitForTimeout(1200)
const draft = await page.evaluate(() => ({
  url: location.pathname,
  title: document.querySelector('.topbar__title')?.textContent,
  heading: document.querySelector('.prose h1')?.textContent,
  syncIcon: document.querySelector('.sync-icon')?.className,
  status: document.querySelector('.status-select')?.value,
}))

// Rename by typing over the heading.
await page.locator('.prose h1').click()
await page.keyboard.press('End')
await page.keyboard.type(' renaming from the heading')
await page.waitForTimeout(600)
const renamed = await page.evaluate(() => document.querySelector('.topbar__title')?.textContent)

// Status change persists.
await page.selectOption('.status-select', 'editing')
await page.waitForTimeout(800)
const afterStatus = await (await fetch('http://127.0.0.1:4319/api/documents', {
  headers: { cookie: (await context.cookies()).map((c) => `${c.name}=${c.value}`).join('; ') },
})).json()
const stored = afterStatus.documents.find((doc) => `/d/${doc.slug}` === draft.url)

await page.screenshot({ path: 'screenshots/editor-status.png' })

console.log(JSON.stringify({ home, draft, renamed, storedStatus: stored?.status, errors }, null, 2))
await browser.close()
