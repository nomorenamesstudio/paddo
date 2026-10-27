import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const browser = await chromium.launch()
for (const mode of [
  { name: 'sticky-desktop', width: 1180, height: 800, mobile: false },
  { name: 'sticky-mobile', width: 390, height: 844, mobile: true },
]) {
  const page = await (await browser.newContext({ viewport: { width: mode.width, height: mode.height }, deviceScaleFactor: mode.mobile ? 3 : 2, isMobile: mode.mobile, hasTouch: mode.mobile })).newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.goto('http://127.0.0.1:4319/')
  await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
  await page.getByRole('button', { name: /open padd/i }).click()
  await page.locator('.documents').waitFor()
  await page.waitForTimeout(500)

  const before = await page.evaluate(() => {
    const header = document.querySelector('.masthead--row').getBoundingClientRect()
    return { top: Math.round(header.top), height: Math.round(header.height), scrollY: window.scrollY }
  })
  await page.evaluate(() => window.scrollTo(0, 400))
  await page.waitForTimeout(400)
  const after = await page.evaluate(() => {
    const header = document.querySelector('.masthead--row').getBoundingClientRect()
    const fab = document.querySelector('.documents__new').getBoundingClientRect()
    return {
      top: Math.round(header.top),
      height: Math.round(header.height),
      scrollY: Math.round(window.scrollY),
      position: getComputedStyle(document.querySelector('.masthead--row')).position,
      fabVisible: fab.bottom <= window.innerHeight + 1,
      docScrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      pagePaddingTop: getComputedStyle(document.querySelector('.page')).paddingTop,
    }
  })
  await page.screenshot({ path: `screenshots/${mode.name}.png` })

  // The horizontal guard must still hold: a deliberately wide element must not pan the page.
  const guard = await page.evaluate(() => {
    const wide = document.createElement('div')
    wide.style.cssText = 'width: 2000px; height: 10px'
    document.body.append(wide)
    const pan = document.documentElement.scrollWidth > document.documentElement.clientWidth
    wide.remove()
    return pan
  })
  console.log(mode.name, JSON.stringify({ before, after, pannedByWideElement: guard }), errors.length ? errors : '')
  await page.close()
}
await browser.close()
