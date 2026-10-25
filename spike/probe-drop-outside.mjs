/** Dropping outside the text column must still land somewhere sensible. */
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
await page.locator(".prose h1").first().waitFor()
await page.waitForTimeout(1200)

const paras = page.locator('.prose > p')
const order = async () => (await paras.allInnerTexts()).map((t) => t.slice(0, 18))
const before = await order()
const viewport = page.viewportSize()

async function dragTo(x, y) {
  await paras.nth(1).hover()
  const g = await page.locator('.grip').boundingBox()
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2)
  await page.mouse.down()
  await page.mouse.move(x, y, { steps: 14 })
  await page.mouse.up()
  await page.waitForTimeout(500)
}

// 1. Release far into the right margin, level with the fourth paragraph.
const third = await paras.nth(3).boundingBox()
await dragTo(viewport.width - 40, third.y + third.height / 2)
const afterMargin = await order()

// 2. Undo, then release below the last block (bottom padding of the column).
await page.locator('.prose').click()
await page.keyboard.press('Control+z')
await page.waitForTimeout(500)
const restored1 = await order()

const editorBox = await page.locator('.editor').boundingBox()
await dragTo(editorBox.x + editorBox.width / 2, editorBox.y + editorBox.height - 12)
const afterBottom = await order()

// 3. Undo, then release back on the grip: that must cancel, not move.
await page.locator('.prose').click()
await page.keyboard.press('Control+z')
await page.waitForTimeout(500)
await paras.nth(1).hover()
const g = await page.locator('.grip').boundingBox()
await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2)
await page.mouse.down()
await page.mouse.move(g.x + g.width / 2 + 40, g.y + 40, { steps: 6 })
await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2, { steps: 6 })
await page.mouse.up()
await page.waitForTimeout(400)
const afterGrip = await order()
const stickyHints = await page.locator('.move-hint').count()

console.log(JSON.stringify({ before, afterMargin, restored1, afterBottom, afterGrip, stickyHints }, null, 2))
await browser.close()
