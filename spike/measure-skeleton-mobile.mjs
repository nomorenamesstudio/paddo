import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const browser = await chromium.launch()
for (const mode of [{ name: 'phone', width: 390, mobile: true }, { name: 'desktop', width: 1180, mobile: false }]) {
  const page = await (await browser.newContext({ viewport: { width: mode.width, height: 820 }, deviceScaleFactor: 3, isMobile: mode.mobile, hasTouch: mode.mobile })).newPage()
  await page.goto('http://127.0.0.1:4319/')
  await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
  await page.getByRole('button', { name: /open padd/i }).click()
  await page.locator('.documents').waitFor()
  await page.goto('http://127.0.0.1:4319/d/the-quiet-interface')
  await page.locator('.skeleton__line').first().waitFor({ timeout: 5000 })
  const skel = await page.evaluate(() => {
    const r = (n) => { const b = n.getBoundingClientRect(); return [Math.round(b.left * 10) / 10, Math.round(b.top * 10) / 10] }
    return {
      title: r(document.querySelector('.skeleton__title')),
      line: r(document.querySelector('.skeleton__line')),
      editorPad: getComputedStyle(document.querySelector('.editor')).padding,
      editorTop: Math.round(document.querySelector('.editor').getBoundingClientRect().top * 10) / 10,
      scrollY: window.scrollY,
    }
  })
  if (mode.name === 'phone') await page.screenshot({ path: 'screenshots/skeleton-phone.png', clip: { x: 0, y: 0, width: 390, height: 620 } })
  await page.locator('.prose p').first().waitFor()
  // The text rises 14px as it arrives; measure it settled, not mid-entrance.
  await page.locator('.editor__body.is-ready').waitFor()
  await page.waitForTimeout(1200)
  const live = await page.evaluate(() => {
    const r = (n) => { const b = n.getBoundingClientRect(); return [Math.round(b.left * 10) / 10, Math.round(b.top * 10) / 10] }
    return {
      h1: r(document.querySelector('.prose h1')),
      p: r(document.querySelector('.prose p')),
      editorTop: Math.round(document.querySelector('.editor').getBoundingClientRect().top * 10) / 10,
      scrollY: window.scrollY,
    }
  })
  if (mode.name === 'phone') await page.screenshot({ path: 'screenshots/live-phone.png', clip: { x: 0, y: 0, width: 390, height: 620 } })
  console.log(mode.name, JSON.stringify({ skel, live }))
  await page.close()
}
await browser.close()
