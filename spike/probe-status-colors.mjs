import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const browser = await chromium.launch()
for (const scheme of ['light', 'dark']) {
  const page = await (await browser.newContext({ viewport: { width: 1180, height: 800 }, deviceScaleFactor: 2, colorScheme: scheme })).newPage()
  await page.goto('http://127.0.0.1:4319/d/the-ghosted-story')
  await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
  await page.getByRole('button', { name: /open padd/i }).click()
  await page.locator('.prose h1').first().waitFor()
  await page.waitForTimeout(1500)
  await page.locator('.status button').click()
  await page.locator('.status__menu').waitFor()
  await page.waitForTimeout(300)
  const info = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.status__item')].map((item) => {
      const icon = item.querySelector('.status-icon')
      return {
        label: item.textContent?.trim(),
        active: item.classList.contains('is-active'),
        iconColor: icon ? getComputedStyle(icon).color : null,
        textColor: getComputedStyle(item).color,
        background: getComputedStyle(item).backgroundColor,
      }
    })
    const sync = document.querySelector('.sync-icon')
    return { rows, syncColor: sync ? getComputedStyle(sync).color : null }
  })
  const box = await page.locator('.status__menu').boundingBox()
  await page.screenshot({ path: `screenshots/status-menu-${scheme}.png`, clip: { x: box.x - 60, y: box.y - 70, width: box.width + 120, height: box.height + 110 } })
  console.log(scheme, JSON.stringify(info, null, 1))
  await page.close()
}
await browser.close()
