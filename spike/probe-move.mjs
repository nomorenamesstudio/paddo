/** Two-tap block move, and whether it is one undo step. Throwaway probe. */
import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'

const ORIGIN = 'http://127.0.0.1:4319'
const slug = 'the-quiet-interface'
const env = Object.fromEntries(
  (await readFile(new URL('../.env', import.meta.url), 'utf8'))
    .split('\n')
    .filter((line) => line.includes('='))
    .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
)

const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage()
page.on('pageerror', (error) => console.log('[pageerror]', String(error)))

await page.goto(`${ORIGIN}/d/${slug}`)
await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD ?? '')
await page.getByRole('button', { name: /open padd/i }).click()
await page.locator('.prose h1').waitFor()
await page.waitForTimeout(1200)

const paragraphs = page.locator('.prose > p')
const order = async () => (await paragraphs.allInnerTexts()).map((text) => text.slice(0, 28))
const before = await order()

// Hover the second paragraph, then pick its grip.
await paragraphs.nth(1).hover()
await page.locator('.grip').waitFor({ timeout: 5000 })
await page.locator('.grip').click()
const hintVisible = await page.locator('.move-hint').isVisible()

// Drop it after the last paragraph.
const last = paragraphs.last()
const box = await last.boundingBox()
if (!box) throw new Error('no bounding box')
await page.mouse.move(box.x + box.width / 2, box.y + box.height - 6)
await page.waitForTimeout(120)
const lineVisible = await page.locator('.move-line').isVisible()
await page.mouse.click(box.x + box.width / 2, box.y + box.height - 6)
await page.waitForTimeout(400)

const after = await order()
const movedToEnd = after[after.length - 1] === before[1]
const firstGone = after[1] === before[2]

// One undo should put it back.
await page.locator('.prose').click()
await page.keyboard.press('Control+z')
await page.waitForTimeout(600)
const undone = await order()

await page.keyboard.press('Control+Shift+z')
await page.waitForTimeout(400)
const redone = await order()

console.log(
  JSON.stringify(
    {
      hintVisible,
      lineVisible,
      before,
      after,
      movedToEnd,
      firstGone,
      undoRestored: JSON.stringify(undone) === JSON.stringify(before),
      redoReapplied: JSON.stringify(redone) === JSON.stringify(after),
      undone: undone.slice(1, 3),
    },
    null,
    2,
  ),
)

await browser.close()
