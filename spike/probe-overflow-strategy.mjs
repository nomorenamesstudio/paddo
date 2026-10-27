import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 4, isMobile: true, hasTouch: true })).newPage()
await page.goto('http://127.0.0.1:4319/')
await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
await page.getByRole('button', { name: /open padd/i }).click()
await page.locator('.documents').waitFor()
await page.waitForTimeout(500)

async function trial(name, css) {
  await page.evaluate(() => {
    document.getElementById('trial')?.remove()
    const style = document.createElement('style')
    style.id = 'trial'
    style.textContent = ''
    document.head.append(style)
    document.body.style.overflowX = ''
    document.documentElement.style.overflowX = ''
  })
  await page.addStyleTag({ content: css })
  const result = await page.evaluate(() => {
    const wide = document.createElement('div')
    wide.style.cssText = 'width: 2000px; height: 10px'
    document.body.append(wide)
    const pan = document.documentElement.scrollWidth - document.documentElement.clientWidth
    wide.remove()
    return { pan }
  })
  const box = await page.locator('.documents__new').boundingBox()
  await page.screenshot({ path: `screenshots/shadow-${name}.png`, clip: { x: box.x - 34, y: box.y - 34, width: box.width + 68, height: box.height + 68 } })
  console.log(name, JSON.stringify(result))
}

await trial('html-hidden', 'html { overflow-x: hidden !important }')
await trial('body-clip', 'body { overflow-x: clip !important } html { overflow-x: visible !important }')
await trial('body-hidden', 'body { overflow-x: hidden !important } html { overflow-x: visible !important }')
await trial('none', 'html, body { overflow-x: visible !important }')
await browser.close()
