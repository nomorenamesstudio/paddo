import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const browser = await chromium.launch()

async function shoot({ name, width, colorScheme, mobile }) {
  const context = await browser.newContext({
    viewport: { width, height: mobile ? 844 : 900 },
    deviceScaleFactor: mobile ? 3 : 2,
    colorScheme,
    isMobile: Boolean(mobile),
    hasTouch: Boolean(mobile),
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.goto('http://127.0.0.1:4319/settings')
  await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
  await page.getByRole('button', { name: /open padd/i }).click()
  await page.locator('.settings__themes').waitFor()
  await page.waitForTimeout(900)
  const state = await page.evaluate(() => ({
    theme: document.documentElement.dataset.theme,
    active: document.querySelector('.settings__theme.is-active')?.textContent?.trim() ?? null,
    bodySelect: getComputedStyle(document.body).userSelect,
    guideSelect: getComputedStyle(document.querySelector('.settings__guide')).userSelect,
    overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  }))
  await page.screenshot({ path: `screenshots/${name}.png` })
  console.log(name, JSON.stringify(state), errors.length ? errors : '')
  await context.close()
}

await shoot({ name: 'theme-settings-light', width: 1180, colorScheme: 'light' })
await shoot({ name: 'theme-settings-dark', width: 1180, colorScheme: 'dark' })
await shoot({ name: 'theme-settings-mobile-dark', width: 390, colorScheme: 'dark', mobile: true })
await browser.close()
