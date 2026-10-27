import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1180, height: 900 }, deviceScaleFactor: 2 })).newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto('http://127.0.0.1:4319/')
await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
await page.getByRole('button', { name: /open padd/i }).click()
await page.locator('.documents').waitFor()

// The editor menu.
await page.goto('http://127.0.0.1:4319/d/the-quiet-interface')
await page.locator('.prose h1').waitFor()
await page.waitForTimeout(2200)
await page.locator('.editor-menu__trigger').click()
await page.locator('.editor-menu .row-menu__panel').waitFor()
const items = await page.locator('.editor-menu .row-menu__item').allInnerTexts()
const menuBox = await page.locator('.editor-menu .row-menu__panel').boundingBox()
await page.screenshot({ path: 'screenshots/editor-menu.png', clip: { x: menuBox.x - 220, y: menuBox.y - 60, width: menuBox.width + 260, height: menuBox.height + 90 } })

// The settings token section.
await page.goto('http://127.0.0.1:4319/settings')
await page.locator('.tokens__form').waitFor()
await page.locator('.tokens__choice', { hasText: 'only these' }).click()
await page.waitForTimeout(200)
const section = await page.locator('.settings__section', { hasText: 'Agent tokens' }).boundingBox()
await page.screenshot({ path: 'screenshots/agent-tokens.png', clip: { x: section.x - 20, y: section.y - 20, width: section.width + 40, height: Math.min(section.height + 40, 900) } })

// Mint one to see the reveal + the list.
await page.locator('.tokens__input').fill('screenshot agent')
await page.locator('.tokens__documents .tokens__choice', { hasText: 'The quiet interface' }).click()
await page.getByRole('button', { name: 'Create token' }).click()
await page.locator('.tokens__secret').waitFor()
await page.waitForTimeout(300)
const withSecret = await page.locator('.settings__section', { hasText: 'Agent tokens' }).boundingBox()
await page.screenshot({ path: 'screenshots/agent-tokens-minted.png', clip: { x: withSecret.x - 20, y: withSecret.y - 20, width: withSecret.width + 40, height: Math.min(withSecret.height + 120, 950) } })
const minted = await page.locator('.tokens__item').allInnerTexts()
console.log(JSON.stringify({ items, minted, errors }))
await browser.close()
