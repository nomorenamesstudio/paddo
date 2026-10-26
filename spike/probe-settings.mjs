import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1180, height: 900 }, deviceScaleFactor: 2 })).newPage()
const errors = []
page.on('pageerror', (error) => errors.push(String(error)))

await page.goto('http://127.0.0.1:4319/')
await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
await page.getByRole('button', { name: /open padd/i }).click()
await page.locator('.documents').waitFor()

// The gear reaches settings without a reload.
await page.locator('a[aria-label="Settings"]').click()
await page.locator('.settings__guide').waitFor()
await page.waitForTimeout(400)
const loaded = await page.evaluate(() => ({
  url: location.pathname,
  chars: document.querySelector('.settings__guide').value.length,
  words: document.querySelector('.settings__meta')?.textContent?.trim(),
  firstLine: document.querySelector('.settings__guide').value.split('\n')[0],
}))
await page.screenshot({ path: 'screenshots/settings.png' })

// Edit and save.
await page.locator('.settings__guide').click()
await page.keyboard.press('Control+End')
await page.keyboard.type('\n\nOne more rule: never open with a definition.')
await page.getByRole('button', { name: 'Save guide' }).click()
await page.locator('.settings__saved').waitFor()
const savedState = await page.locator('.settings__saved').innerText()

const stored = await page.evaluate(async () => {
  const response = await fetch('/api/settings')
  const body = await response.json()
  return { endsWith: body.writingGuide.slice(-48) }
})

// The guide travels with the invite prompt.
await page.goto('http://127.0.0.1:4319/d/new-draft-5')
await page.locator('.prose h1').first().waitFor()
await page.waitForTimeout(1200)
await page.locator('.topbar .button--icon[aria-label="Invite the agent"]').click()
await page.locator('.sheet').waitFor()
await page.waitForTimeout(500)
const prompt = await page.locator('.sheet__prompt').innerText()
await page.screenshot({ path: 'screenshots/settings-prompt.png' })

console.log(JSON.stringify({
  loaded,
  savedState,
  stored,
  promptHasGuide: prompt.includes('Writing guide (from Paddō settings)'),
  promptGuideFirstLine: prompt.split('\n').find((line) => line.startsWith('# Writing Style Guide')) ?? null,
  promptLength: prompt.length,
  errors,
}, null, 2))
await browser.close()
