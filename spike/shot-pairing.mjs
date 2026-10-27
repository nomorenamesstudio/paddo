import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const base = 'http://127.0.0.1:4319'
const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1180, height: 1000 }, deviceScaleFactor: 2 })).newPage()
await page.goto(base)
await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
await page.getByRole('button', { name: /open padd/i }).click()
await page.locator('.documents').waitFor()
await page.goto(`${base}/settings`)
await page.locator('.tokens__form').waitFor()

// Leftovers from earlier probes would clutter the shot.
await page.evaluate(async () => {
  const { pairings } = await (await fetch('/api/pair')).json()
  for (const pairing of pairings) {
    await fetch(`/api/pair/${pairing.code}/deny`, { method: 'POST' })
  }
})

await page.locator('.tokens__input').fill('my case study agent')
await page.locator('.tokens__choice', { hasText: 'only these' }).click()
await page.locator('.tokens__documents .tokens__choice', { hasText: 'The quiet interface' }).click()
await page.getByRole('button', { name: 'Pair an agent' }).click()
await page.locator('.tokens__paircode').waitFor()
const code = (await page.locator('.tokens__paircode').innerText()).trim()

// The agent claims the code from somewhere else entirely.
await fetch(`${base}/api/pair/claim`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ code }),
})
await page.waitForTimeout(3200)
await page.locator('.tokens__paircode').scrollIntoViewIfNeeded()
await page.waitForTimeout(400)
const box = await page.locator('.tokens__secret').boundingBox()
await page.screenshot({ path: 'screenshots/agent-pairing.png', clip: { x: box.x - 12, y: box.y - 12, width: box.width + 24, height: Math.min(box.height + 24, 1250) } })
console.log(JSON.stringify({ code, approveVisible: await page.getByRole('button', { name: /^Approve/ }).first().isVisible() }))
await browser.close()
