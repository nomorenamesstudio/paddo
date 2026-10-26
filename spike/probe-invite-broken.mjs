import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const browser = await chromium.launch()

for (const mode of [{ name: 'desktop', width: 1180, height: 900, mobile: false }, { name: 'mobile', width: 390, height: 844, mobile: true }]) {
  const context = await browser.newContext({
    viewport: { width: mode.width, height: mode.height },
    deviceScaleFactor: 2,
    isMobile: mode.mobile,
    hasTouch: mode.mobile,
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(String(error)))
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`) })
  await page.goto('http://127.0.0.1:4319/d/new-draft-6')
  await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
  await page.getByRole('button', { name: /open padd/i }).click()
  await page.locator('.prose h1').first().waitFor()
  await page.waitForTimeout(1400)
  await page.getByRole('button', { name: 'Invite the agent' }).click()
  await page.locator('.sheet').waitFor({ timeout: 5000 }).catch(() => {})
  await page.waitForTimeout(700)

  const info = await page.evaluate(() => {
    const sheet = document.querySelector('.sheet')
    const panel = document.querySelector('.sheet__panel')
    const prompt = document.querySelector('.sheet__prompt')
    const rect = (el) => (el ? { top: Math.round(el.getBoundingClientRect().top), height: Math.round(el.getBoundingClientRect().height), width: Math.round(el.getBoundingClientRect().width) } : null)
    return {
      sheetExists: Boolean(sheet),
      panel: rect(panel),
      sheet: rect(sheet),
      viewportHeight: window.innerHeight,
      panelStyle: panel ? {
        position: getComputedStyle(panel).position,
        transform: getComputedStyle(panel).transform,
        maxHeight: getComputedStyle(panel).maxHeight,
        overflowY: getComputedStyle(panel).overflowY,
        display: getComputedStyle(panel).display,
      } : null,
      promptChars: prompt?.textContent?.length ?? null,
      promptScroll: prompt ? { clientHeight: prompt.clientHeight, scrollHeight: prompt.scrollHeight, overflowY: getComputedStyle(prompt).overflowY } : null,
      buttons: [...document.querySelectorAll('.sheet button')].map((b) => ({ text: b.textContent?.trim().slice(0, 18), ...rect(b) })),
    }
  })
  await page.screenshot({ path: `screenshots/invite-${mode.name}.png` })
  console.log(mode.name, JSON.stringify(info, null, 2), errors.length ? errors : '')
  await context.close()
}
await browser.close()
