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

const paragraphs = page.locator('.prose > p')
await paragraphs.nth(1).hover()
await page.locator('.grip').waitFor()
console.log('grip box', await page.locator('.grip').boundingBox())
await page.locator('.grip').click()
await page.waitForTimeout(200)
console.log('hint', await page.locator('.move-hint').innerText().catch(() => 'none'))

const box = await paragraphs.last().boundingBox()
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
await page.waitForTimeout(300)
const viaMouse = await page.evaluate(() => document.querySelectorAll('.move-line').length)

await page.evaluate(({x, y}) => {
  document.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, bubbles: true }))
}, { x: box.x + box.width / 2, y: box.y + box.height / 2 })
await page.waitForTimeout(300)
const viaDispatch = await page.evaluate(() => document.querySelectorAll('.move-line').length)

const info = await page.evaluate(() => ({
  viaDispatchCount: document.querySelectorAll('.move-line').length,
  lines: document.querySelectorAll('.move-line').length,
  lineBox: document.querySelector('.move-line')?.getBoundingClientRect(),
  editorPos: getComputedStyle(document.querySelector('.editor')).position,
}))
console.log('lines via playwright mouse:', viaMouse, 'via dispatch:', viaDispatch)
console.log('after move', JSON.stringify(info))
await browser.close()
