import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
const page = await context.newPage()
await page.goto('http://127.0.0.1:4319/')
await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
await page.getByRole('button', { name: /open padd/i }).click()
await page.locator('.documents').waitFor()
await page.waitForTimeout(500)

const report = async (label) => {
  const data = await page.evaluate(() => {
    const width = document.documentElement.clientWidth
    const offenders = [...document.querySelectorAll('body *')]
      .map((el) => ({ el, rect: el.getBoundingClientRect() }))
      .filter(({ rect }) => rect.right > width + 1 || rect.left < -1)
      .slice(0, 8)
      .map(({ el, rect }) => ({
        tag: el.tagName.toLowerCase(),
        cls: el.className?.toString?.().slice(0, 40) ?? '',
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        width: Math.round(rect.width),
      }))
    return {
      clientWidth: width,
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      canScrollX: document.documentElement.scrollWidth > width,
      offenders,
    }
  })
  console.log(label, JSON.stringify(data))
}

await report('documents')
await page.goto('http://127.0.0.1:4319/settings')
await page.locator('.settings__guide').waitFor()
await page.waitForTimeout(300)
await report('settings')
await browser.close()
