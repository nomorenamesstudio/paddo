import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1180, height: 900 } })).newPage()
await page.goto('http://127.0.0.1:4319/d/new-draft-6')
await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
await page.getByRole('button', { name: /open padd/i }).click()
await page.locator('.prose h1').first().waitFor()
await page.waitForTimeout(1300)
await page.getByRole('button', { name: 'Invite the agent' }).click()
await page.locator('.sheet').waitFor()
await page.waitForTimeout(400)
const probe = await page.evaluate(() => {
  const bar = document.querySelector('.bottombar')
  const accept = [...document.querySelectorAll('.bottombar .button')].find((b) => b.textContent.includes('Accept all'))
  const rect = accept.getBoundingClientRect()
  const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
  return {
    sheetZ: getComputedStyle(document.querySelector('.sheet')).zIndex,
    barZ: getComputedStyle(bar).zIndex,
    barHitThroughSheet: hit === accept || Boolean(hit?.closest('.bottombar')),
    hitTag: hit?.tagName,
    hitClass: hit?.className?.toString?.().slice(0, 40),
  }
})
console.log(JSON.stringify(probe, null, 2))
await browser.close()
