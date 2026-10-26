/** Does the document fade in while the placeholder fades out? */
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

await page.locator('.documents__row', { hasText: 'The quiet interface' }).click()

const samples = []
let sawFading = false
for (let attempt = 0; attempt < 400; attempt += 1) {
  const state = await page.evaluate(() => {
    const body = document.querySelector('.editor__body')
    const skeleton = document.querySelector('.skeleton')
    return {
      bodyOpacity: body ? Number(getComputedStyle(body).opacity).toFixed(2) : null,
      skeletonOpacity: skeleton ? Number(getComputedStyle(skeleton).opacity).toFixed(2) : null,
      fading: skeleton?.classList.contains('is-fading') ?? false,
      gone: !skeleton,
    }
  })
  if (state.fading) sawFading = true
  if (!samples.length || JSON.stringify(samples.at(-1)) !== JSON.stringify(state)) samples.push(state)
  if (state.gone) break
  await page.waitForTimeout(20)
}

console.log(JSON.stringify({ sawFading, samples: samples.slice(-8) }, null, 2))
await browser.close()
