import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))

const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage()
page.on('pageerror', (e) => console.log('[pageerror]', String(e)))
await page.goto('http://127.0.0.1:4319/')
await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
await page.getByRole('button', { name: /open padd/i }).click()
await page.locator('.documents').waitFor()
const slug = await page.evaluate(async () => {
  const r = await fetch('/api/documents', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Undo probe ' + Date.now() }) })
  return (await r.json()).slug
})
await page.goto(`http://127.0.0.1:4319/d/${slug}`)
await page.locator('.prose h1').waitFor()
await page.waitForTimeout(800)

await page.locator('.prose p').last().click()
await page.keyboard.type('First block stays here.')
await page.keyboard.press('Enter')
await page.keyboard.type('Second block should move up.')
await page.waitForTimeout(600)
const order = async () => (await page.locator('.prose > p').allInnerTexts()).map((t) => t.trim())
const before = await order()

await page.locator('.prose > p').nth(1).hover()
const grip = page.locator('.grip')
const gripBox = await grip.boundingBox()
const firstBox = await page.locator('.prose > p').first().boundingBox()
await page.mouse.move(gripBox.x + gripBox.width / 2, gripBox.y + gripBox.height / 2)
await page.mouse.down()
await page.mouse.move(firstBox.x + firstBox.width / 2, firstBox.y + 4, { steps: 10 })
await page.mouse.up()
await page.waitForTimeout(500)
const afterDrag = await order()

await page.locator('.prose').click()
await page.keyboard.press('Control+z')
await page.waitForTimeout(500)
const undo1 = await order()
await page.keyboard.press('Control+z')
await page.waitForTimeout(500)
const undo2 = await order()

console.log(JSON.stringify({ before, afterDrag, undo1, undo2 }, null, 2))
await browser.close()
