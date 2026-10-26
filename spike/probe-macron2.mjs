import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1180, height: 860 } })).newPage()
const requests = []
page.on('request', (r) => { if (r.url().includes('/fonts/')) requests.push(r.url().split('/fonts/')[1]) })
await page.goto('http://127.0.0.1:4319/')
await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
await page.getByRole('button', { name: /open padd/i }).click()
await page.locator('.documents').waitFor()
await page.waitForTimeout(1500)

const before = await page.evaluate(() => ({
  mark: document.querySelector('.wordmark')?.textContent,
  check: document.fonts.check('1rem "Young Serif"', 'ō'),
  faces: [...document.fonts].map((f) => `${f.family}/${f.unicodeRange.slice(0, 12)}/${f.status}`),
}))

const forced = await page.evaluate(async () => {
  const loaded = await document.fonts.load('1rem "Young Serif"', 'ō')
  return {
    loaded: loaded.map((f) => `${f.family} ${f.unicodeRange.slice(0, 10)} ${f.status}`),
    check: document.fonts.check('1rem "Young Serif"', 'ō'),
  }
})
await page.waitForTimeout(800)
const after = await page.evaluate(() => ({
  check: document.fonts.check('1rem "Young Serif"', 'ō'),
  faces: [...document.fonts].map((f) => `${f.family}/${f.unicodeRange.slice(0, 12)}/${f.status}`),
}))
console.log(JSON.stringify({ before, forced, after, requests }, null, 2))
await browser.close()
