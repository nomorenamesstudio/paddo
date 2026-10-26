import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const browser = await chromium.launch()

async function shoot({ name, width, height, mobile, scheme }) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: mobile ? 3 : 2,
    isMobile: Boolean(mobile),
    hasTouch: Boolean(mobile),
    colorScheme: scheme ?? 'light',
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.goto('http://127.0.0.1:4319/d/new-draft-5')
  await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
  await page.getByRole('button', { name: /open padd/i }).click()
  await page.locator('.prose h1').first().waitFor()
  await page.waitForTimeout(1500)
  const state = await page.evaluate(() => ({
    total: document.querySelectorAll('.sug-hunk').length,
    rejectAll: (() => {
      const button = [...document.querySelectorAll('.bottombar .button')].find((b) => b.textContent.includes('Reject all'))
      return button ? getComputedStyle(button).color : null
    })(),
    colors: [...document.querySelectorAll('.sug-hunk .sug-action')].slice(0, 3).map((b) => ({
      action: b.dataset.sugAction,
      color: getComputedStyle(b).color,
      background: getComputedStyle(b).backgroundColor,
    })),
    widths: [...document.querySelectorAll('.sug-hunk')].map((h) => Math.round(h.getBoundingClientRect().width)),
    overflow: document.documentElement.scrollWidth > window.innerWidth,
  }))
  await page.screenshot({ path: `screenshots/${name}.png` })
  console.log(name, JSON.stringify(state), errors.length ? errors : '')
  await context.close()
}

await shoot({ name: 'hunks-desktop', width: 1180, height: 1000 })
await shoot({ name: 'hunks-mobile-dark', width: 390, height: 844, mobile: true, scheme: 'dark' })
await browser.close()
