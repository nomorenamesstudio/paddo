import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const browser = await chromium.launch()
for (const mode of [
  { name: 'no-line-desktop', width: 1180, height: 800, mobile: false },
  { name: 'no-line-mobile', width: 390, height: 844, mobile: true },
]) {
  const page = await (await browser.newContext({ viewport: { width: mode.width, height: mode.height }, deviceScaleFactor: mode.mobile ? 3 : 2, isMobile: mode.mobile, hasTouch: mode.mobile })).newPage()
  await page.goto('http://127.0.0.1:4319/')
  await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
  await page.getByRole('button', { name: /open padd/i }).click()
  await page.locator('.documents').waitFor()
  await page.waitForTimeout(500)
  const info = await page.evaluate(() => {
    const list = document.querySelector('.documents')
    const header = document.querySelector('.masthead--row')
    return {
      listBorderTop: getComputedStyle(list).borderTopWidth,
      listMarginTop: getComputedStyle(list).marginTop,
      headerMarginBottom: getComputedStyle(header).marginBottom,
      headerHasBorder: getComputedStyle(header).borderBottomWidth,
      firstRowBorderTop: getComputedStyle(document.querySelector('.documents__item')).borderTopWidth,
      firstRowBorderBottom: getComputedStyle(document.querySelector('.documents__item')).borderBottomWidth,
    }
  })
  await page.screenshot({ path: `screenshots/${mode.name}.png`, clip: { x: 0, y: 0, width: mode.width, height: 260 } })
  console.log(mode.name, JSON.stringify(info))
  await page.close()
}
await browser.close()
