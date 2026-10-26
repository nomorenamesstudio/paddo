import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1180, height: 900 }, deviceScaleFactor: 2 })).newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto('http://127.0.0.1:4319/')
await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
await page.getByRole('button', { name: /open padd/i }).click()
await page.locator('.documents').waitFor()

// A throwaway document so the rename does not touch his drafts.
const slug = await page.evaluate(async () => {
  const created = await (await fetch('/api/documents', { method: 'POST' })).json()
  return created.slug
})
await page.goto(`http://127.0.0.1:4319/d/${slug}`)
await page.locator('.prose h1').first().waitFor()
await page.waitForTimeout(1200)

const openSheet = async () => {
  await page.locator('.topbar .button--icon[aria-label="Invite the agent"]').click()
  await page.locator('.sheet').waitFor()
  const label = await page.locator('.sheet .field__label').innerText()
  const prompt = await page.locator('.sheet__prompt').innerText()
  await page.locator('.sheet__close').click()
  await page.waitForTimeout(200)
  return { label, firstLine: prompt.split('\n')[0] }
}

const before = await openSheet()

// Rename through the heading, then reopen.
await page.locator('.prose h1').click()
await page.keyboard.press('End')
await page.keyboard.type(' about tides')
await page.waitForTimeout(500)
const title = await page.locator('.topbar__title').innerText()
const after = await openSheet()
await page.locator('.topbar .button--icon[aria-label="Invite the agent"]').click()
await page.locator('.sheet').waitFor()
await page.screenshot({ path: 'screenshots/invite-sheet.png' })

await page.evaluate((target) => fetch(`/api/documents/${target}`, { method: 'DELETE' }), slug)
console.log(JSON.stringify({ slug, before, title, after, errors }, null, 2))
await browser.close()
