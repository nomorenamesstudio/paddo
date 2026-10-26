import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const browser = await chromium.launch()
const page = await (await browser.newContext({ colorScheme: 'light' })).newPage()
const problems = []
page.on('pageerror', (error) => problems.push(String(error)))
await page.goto('http://127.0.0.1:4319/')
await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
await page.getByRole('button', { name: /open padd/i }).click()
await page.locator('.documents').waitFor()
await page.goto('http://127.0.0.1:4319/settings')
await page.locator('.settings__themes').waitFor()
await page.waitForTimeout(800)

const dump = await page.evaluate(() => ({
  attrs: [...document.documentElement.attributes].map((a) => `${a.name}=${a.value}`),
  headHasScript: document.head.innerHTML.includes('paddo-theme'),
  buttons: [...document.querySelectorAll('.settings__theme')].map((b) => ({
    text: b.textContent?.trim(),
    cls: b.className,
    checked: b.getAttribute('aria-checked'),
    disabled: b.disabled,
  })),
  stored: window.localStorage.getItem('paddo-theme'),
}))
console.log('after direct load of /settings:', JSON.stringify(dump, null, 2))
console.log('page errors:', problems)

await page.reload()
await page.locator('.settings__themes').waitFor()
await page.waitForTimeout(800)
const afterReload = await page.evaluate(() => ({
  attrs: [...document.documentElement.attributes].map((a) => `${a.name}=${a.value}`),
  headHasScript: document.head.innerHTML.includes('paddo-theme'),
  stored: window.localStorage.getItem('paddo-theme'),
}))
console.log('after reload:', JSON.stringify(afterReload, null, 2))
await browser.close()
