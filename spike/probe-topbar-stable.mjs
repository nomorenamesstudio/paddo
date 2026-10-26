/** Does anything in the top bar move while the document loads? */
import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1180, height: 860 } })
const page = await context.newPage()
await page.goto('http://127.0.0.1:4319/')
await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
await page.getByRole('button', { name: /open padd/i }).click()
await page.locator('.documents').waitFor()

const client = await context.newCDPSession(page)
await client.send('Network.emulateNetworkConditions', {
  offline: false,
  latency: 300,
  downloadThroughput: (600 * 1024) / 8,
  uploadThroughput: (300 * 1024) / 8,
})

const samples = []
await page.locator('.documents__row', { hasText: 'The quiet interface' }).click()

for (let attempt = 0; attempt < 120; attempt += 1) {
  const state = await page.evaluate(() => {
    const rect = (selector) => {
      const node = document.querySelector(selector)
      if (!node) return null
      const box = node.getBoundingClientRect()
      return { x: Math.round(box.x), w: Math.round(box.width) }
    }
    return {
      sync: rect('.sync-icon'),
      title: rect('.topbar__title'),
      back: rect('.topbar__back'),
      skeleton: Boolean(document.querySelector('.skeleton')),
      status: Boolean(document.querySelector('.status')),
    }
  })
  const last = samples.at(-1)
  if (!last || JSON.stringify(last.state) !== JSON.stringify(state)) samples.push({ state, at: attempt })
  if (!state.skeleton && !samples.at(-1)?.state.skeleton) {
    const synced = await page.evaluate(() => Boolean(document.querySelector('.sync-icon--connected')))
    if (synced) break
  }
  await page.waitForTimeout(30)
}

const settled = await page.evaluate(() => {
  const sync = document.querySelector('.sync-icon')?.getBoundingClientRect()
  const title = document.querySelector('.topbar__title')?.getBoundingClientRect()
  return {
    syncX: Math.round(sync?.x ?? -1),
    titleX: Math.round(title?.x ?? -1),
    titleW: Math.round(title?.width ?? -1),
    status: Boolean(document.querySelector('.status')),
    skeleton: Boolean(document.querySelector('.skeleton')),
  }
})

const first = samples[0]?.state
console.log(
  JSON.stringify(
    {
      firstSyncX: first?.sync?.x,
      settledSyncX: settled.syncX,
      firstTitle: first?.title,
      settled,
      stable: first?.sync?.x === settled.syncX && first?.title?.x === settled.titleX,
    },
    null,
    2,
  ),
)
await browser.close()
