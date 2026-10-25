import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'

const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))

const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage()
page.on('pageerror', (e) => console.log('[pageerror]', String(e)))
await page.goto('http://127.0.0.1:4319/d/the-quiet-interface')
await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
await page.getByRole('button', { name: /open padd/i }).click()
await page.locator('.prose h1').waitFor()
await page.waitForTimeout(1200)

const paras = page.locator('.prose > p')
const order = async () => (await paras.allInnerTexts()).map((t) => t.slice(0, 22))
const before = await order()

// --- drag the second paragraph to the end -----------------------------------
await paras.nth(1).hover()
await page.locator('.grip').waitFor()
const gripBox = await page.locator('.grip').boundingBox()
await page.mouse.move(gripBox.x + gripBox.width / 2, gripBox.y + gripBox.height / 2)
await page.mouse.down()
await page.waitForTimeout(120)
const lifted = await page.locator('.prose > p.is-moving').count()
const lastBox = await paras.last().boundingBox()
await page.mouse.move(lastBox.x + lastBox.width / 2, lastBox.y + lastBox.height - 4, { steps: 12 })
await page.waitForTimeout(200)
const lineSeen = await page.locator('.move-line').count()
await page.mouse.up()
await page.waitForTimeout(400)
const afterDrag = await order()

// --- tap the grip, then tap a destination (touch path) ----------------------
await paras.nth(0).hover()
await page.locator('.grip').waitFor()
await page.locator('.grip').click()
await page.waitForTimeout(150)
const stillPicked = await page.locator('.move-hint').count()
const firstBox = await paras.nth(2).boundingBox()
await page.mouse.click(firstBox.x + firstBox.width / 2, firstBox.y + 6)
await page.waitForTimeout(400)
const afterTap = await order()

// --- undo restores both moves ----------------------------------------------
await page.locator('.prose').click()
await page.keyboard.press('Control+z')
await page.waitForTimeout(300)
await page.keyboard.press('Control+z')
await page.waitForTimeout(500)
const restored = await order()

console.log(JSON.stringify({ before, lifted, lineSeen, afterDrag, stillPicked, afterTap, restored, backToOriginal: JSON.stringify(restored) === JSON.stringify(before) }, null, 2))
await browser.close()
