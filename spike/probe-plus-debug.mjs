import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1180, height: 860 } })).newPage()
page.on('pageerror', (e) => console.log('[pageerror]', String(e)))
page.on('console', (m) => { if (m.type() === 'error') console.log('[console]', m.text()) })
await page.goto('http://127.0.0.1:4319/')
await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
await page.getByRole('button', { name: /open padd/i }).click()
await page.locator('.documents').waitFor()

const response = page.waitForResponse((r) => r.url().includes('/api/documents') && r.request().method() === 'POST')
await page.locator('.masthead--row .button--icon').click()
const created = await response
console.log('POST status:', created.status(), (await created.text()).slice(0, 120))

await page.waitForTimeout(3000)
console.log('url:', page.url())
console.log('body:', (await page.locator('body').innerText()).slice(0, 200).replace(/\n/g, ' | '))
await browser.close()
