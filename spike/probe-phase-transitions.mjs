/** Samples the header's current line every 400ms and logs each change. */
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const PORT = process.env.PROBE_PORT ?? '4321'
const PASSWORD = process.env.PROBE_PASSWORD ?? 'paddo-test-password'
await mkdir('.cache', { recursive: true })
const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1180, height: 800 } })).newPage()
await page.goto(`http://127.0.0.1:${PORT}/`)
await page.locator('input[type="password"]').fill(PASSWORD)
await page.getByRole('button', { name: /open padd/i }).click()
await page.locator('.documents').waitFor()
const href = await page.evaluate(() => document.querySelector('.documents__item a')?.getAttribute('href'))
await page.goto(`http://127.0.0.1:${PORT}${href}`)
await page.locator('.headline').waitFor()

const log = []
const started = Date.now()
let last = null
for (let i = 0; i < 60; i += 1) {
  const seen = await page.evaluate(() => {
    const current = document.querySelector('.headline__layer[data-state="current"]')
    return current?.textContent?.trim() ?? null
  })
  if (seen !== last) {
    log.push({ ms: Date.now() - started, phase: seen })
    last = seen
  }
  await page.waitForTimeout(400)
}
await writeFile('.cache/phase-log.json', JSON.stringify(log, null, 1))
console.log(JSON.stringify(log))
await browser.close()
