import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1180, height: 900 }, deviceScaleFactor: 2 })).newPage()
const errors = []
page.on('pageerror', (error) => errors.push(String(error)))
await page.goto('http://127.0.0.1:4319/d/new-draft-6')
await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
await page.getByRole('button', { name: /open padd/i }).click()
await page.locator('.prose h1').first().waitFor()
await page.waitForTimeout(1400)
await page.getByRole('button', { name: 'Invite the agent' }).click()
await page.locator('.sheet').waitFor()
await page.waitForTimeout(600)

const read = async () => page.evaluate(() => {
  const box = document.querySelector('.sheet__toggle input')
  const prompt = document.querySelector('.sheet__prompt')?.textContent ?? ''
  return {
    toggleVisible: Boolean(box),
    checked: box?.checked ?? null,
    meta: document.querySelector('.sheet__toggle-meta')?.textContent ?? null,
    hasGuideBlock: prompt.includes('Writing guide (from Paddō settings)'),
    promptChars: prompt.length,
  }
})

const withGuide = await read()
await page.locator('.sheet__toggle input').uncheck()
await page.waitForTimeout(400)
const withoutGuide = await read()
await page.screenshot({ path: 'screenshots/guide-toggle.png' })

// The choice is remembered on the next open.
await page.locator('.sheet__close').click()
await page.waitForTimeout(300)
await page.getByRole('button', { name: 'Invite the agent' }).click()
await page.locator('.sheet').waitFor()
await page.waitForTimeout(600)
const reopened = await read()

await page.locator('.sheet__toggle input').check()
await page.waitForTimeout(300)
const backOn = await read()

console.log(JSON.stringify({ withGuide, withoutGuide, reopened, backOn, errors }, null, 2))
await browser.close()
