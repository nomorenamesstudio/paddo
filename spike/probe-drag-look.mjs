/** Look at the drag: padding on the carried block, no selection, edge-only marker. */
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
await page.locator('.prose h1').first().waitFor()
await page.waitForTimeout(1200)

const paras = page.locator('.prose > p')
await paras.nth(3).hover()
const g = await page.locator('.grip').boundingBox()
const target = await paras.nth(1).boundingBox()

await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2)
await page.mouse.down()
await page.mouse.move(target.x + target.width * 0.3, target.y + 6, { steps: 16 })
await page.waitForTimeout(250)

const look = await page.evaluate(() => {
  const carried = document.querySelector('.prose .is-dragging')
  const drop = document.querySelector('.prose .is-drop-target')
  const carriedStyle = carried ? getComputedStyle(carried) : null
  const dropStyle = drop ? getComputedStyle(drop) : null
  return {
    carriedPadding: carriedStyle ? `${carriedStyle.paddingTop} ${carriedStyle.paddingLeft}` : null,
    carriedMargin: carriedStyle ? `${carriedStyle.marginTop} ${carriedStyle.marginLeft}` : null,
    dropClass: drop?.className ?? null,
    dropBackground: dropStyle?.backgroundColor ?? null,
    dropShadow: dropStyle?.boxShadow ?? null,
    selectionRanges: window.getSelection()?.rangeCount ?? null,
    selectionText: window.getSelection()?.toString().slice(0, 40) ?? null,
    bodyMode: document.body.classList.contains('is-moving-mode'),
  }
})
await page.screenshot({ path: 'screenshots/move-dragging.png' })
await page.mouse.up()
await page.waitForTimeout(400)
await page.screenshot({ path: 'screenshots/move-dropped.png' })

// Leave the demo document as it was.
await page.locator('.prose').click()
await page.keyboard.press('Control+z')
await page.waitForTimeout(700)

console.log(JSON.stringify(look, null, 2))
await browser.close()
