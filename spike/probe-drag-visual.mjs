import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))

const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1180, height: 900 }, deviceScaleFactor: 2 })).newPage()
page.on('pageerror', (e) => console.log('[pageerror]', String(e)))
await page.goto('http://127.0.0.1:4319/d/the-quiet-interface')
await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
await page.getByRole('button', { name: /open padd/i }).click()
await page.locator('.prose h1').waitFor()
await page.waitForTimeout(1200)

const paras = page.locator('.prose > p')
const order = async () => (await paras.allInnerTexts()).map((t) => t.slice(0, 20))
const before = await order()

await paras.nth(1).hover()
const grip = page.locator('.grip')
const g = await grip.boundingBox()
const target = paras.nth(3)
const t = await target.boundingBox()

await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2)
await page.mouse.down()
await page.mouse.move(t.x + t.width / 2, t.y + t.height - 10, { steps: 14 })
await page.waitForTimeout(250)

const midDrag = await page.evaluate(() => {
  const carried = document.querySelector('.prose .is-dragging')
  const gap = document.querySelector('.prose .is-drop-target')
  return {
    carried: carried ? getComputedStyle(carried).transform : null,
    carriedText: carried?.textContent?.slice(0, 24) ?? null,
    gap: gap ? { top: gap.style.paddingTop, bottom: gap.style.paddingBottom } : null,
    gapText: gap?.textContent?.slice(0, 24) ?? null,
  }
})
await page.screenshot({ path: 'screenshots/move-dragging.png' })

await page.mouse.up()
await page.waitForTimeout(500)
const after = await order()
const leftovers = await page.evaluate(() => ({
  carried: document.querySelectorAll('.is-dragging').length,
  gaps: document.querySelectorAll('.is-drop-target').length,
}))

await page.locator('.prose').click()
await page.keyboard.press('Control+z')
await page.waitForTimeout(400)
const undone = await order()

console.log(JSON.stringify({ before, midDrag, after, leftovers, undoRestored: JSON.stringify(undone) === JSON.stringify(before) }, null, 2))
await browser.close()
