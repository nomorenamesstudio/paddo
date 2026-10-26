import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: 1180, height: 900 },
  deviceScaleFactor: 2,
  colorScheme: 'light',
})
const page = await context.newPage()
const errors = []
page.on('pageerror', (error) => errors.push(String(error)))

await page.goto('http://127.0.0.1:4319/')
await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
await page.getByRole('button', { name: /open padd/i }).click()
await page.locator('.documents').waitFor()
await page.locator('a[aria-label="Settings"]').click()
await page.locator('.settings__themes').waitFor()
await page.waitForTimeout(600)

const state = async () => page.evaluate(() => ({
  attr: document.documentElement.dataset.theme,
  setting: document.documentElement.dataset.themeSetting,
  bg: getComputedStyle(document.body).backgroundColor,
  active: document.querySelector(".settings__theme.is-active")?.textContent?.trim() ?? null,
  scheme: getComputedStyle(document.documentElement).colorScheme,
}))

const initial = await state()
await page.getByRole('radio', { name: 'Dark' }).click()
await page.waitForTimeout(700)
const dark = await state()
await page.screenshot({ path: 'screenshots/theme-dark.png' })

const stored = await page.evaluate(async () => (await (await fetch('/api/settings')).json()).theme)

// Survives a full reload, both the attribute and the saved value.
await page.reload()
await page.locator('.settings__themes').waitFor()
await page.waitForTimeout(700)
const afterReload = await state()

await page.getByRole('radio', { name: 'Light' }).click()
await page.waitForTimeout(600)
const light = await state()
await page.screenshot({ path: 'screenshots/theme-light.png' })

// Back to system: with a dark OS the page must go dark on its own.
await page.emulateMedia({ colorScheme: 'dark' })
await page.getByRole('radio', { name: 'System' }).click()
await page.waitForTimeout(600)
const system = await state()
const guideKept = await page.evaluate(async () => (await (await fetch('/api/settings')).json()).writingGuide.length)

console.log(JSON.stringify({ initial, dark, stored, afterReload, light, system, guideKept, errors }, null, 2))
await browser.close()
