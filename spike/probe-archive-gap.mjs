import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const browser = await chromium.launch()
for (const mode of [
  { name: 'archive-gap-desktop', width: 1180, mobile: false },
  { name: 'archive-gap-mobile', width: 390, mobile: true },
]) {
  const page = await (await browser.newContext({ viewport: { width: mode.width, height: 800 }, deviceScaleFactor: mode.mobile ? 3 : 2, isMobile: mode.mobile, hasTouch: mode.mobile })).newPage()
  await page.goto('http://127.0.0.1:4319/')
  await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
  await page.getByRole('button', { name: /open padd/i }).click()
  await page.locator('.documents').waitFor()
  await page.waitForTimeout(500)
  const m = await page.evaluate(() => {
    const list = document.querySelector('.documents').getBoundingClientRect()
    const summary = document.querySelector('.archive__summary')?.getBoundingClientRect()
    const r = (v) => Math.round(v * 10) / 10
    return {
      listBottom: r(list.bottom),
      summaryTop: summary ? r(summary.top) : null,
      gap: summary ? r(summary.top - list.bottom) : null,
      archiveCount: document.querySelector('.archive__count')?.textContent ?? null,
    }
  })
  await page.screenshot({ path: `screenshots/${mode.name}.png`, fullPage: false })
  console.log(mode.name, JSON.stringify(m))
  await page.close()
}
await browser.close()
