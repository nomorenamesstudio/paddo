import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 })).newPage()
await page.goto('http://127.0.0.1:4319/d/the-quiet-interface')
await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
await page.getByRole('button', { name: /open padd/i }).click()
await page.locator('.prose h1').waitFor()
await page.waitForTimeout(1000)
const paras = page.locator('.prose > p')
await paras.nth(1).hover()
await page.locator('.grip').click()
await page.waitForTimeout(400)
const domProbe = await page.evaluate(() => {
  const view = window.__paddo.editor.view
  const first = view.nodeDOM(0)
  const second = view.state.doc.child(1)
  const secondPos = view.state.doc.child(0).nodeSize
  const secondDom = view.nodeDOM(secondPos)
  return {
    firstTag: first?.nodeName,
    secondTag: secondDom?.nodeName,
    secondClass: secondDom?.className,
    docChildren: view.state.doc.childCount,
    second: second.type.name,
  }
})
console.log('domProbe', JSON.stringify(domProbe))

const lift = await page.evaluate(() => {
  const node = document.querySelector('.move-frame')
  const box = node?.getBoundingClientRect()
  return { found: Boolean(node), top: Math.round(box?.top ?? -1), height: Math.round(box?.height ?? -1) }
})
await page.screenshot({ path: 'screenshots/move-picked.png' })
console.log(JSON.stringify(lift))
await browser.close()
