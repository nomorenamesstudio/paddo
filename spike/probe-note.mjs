import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const axeSource = await readFile(new URL('../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8')
const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1180, height: 900 }, deviceScaleFactor: 2, colorScheme: 'dark' })).newPage()
const errors = []
page.on('pageerror', (error) => errors.push(String(error)))
await page.evaluate(() => {}).catch(() => {})
await page.goto('http://127.0.0.1:4319/d/new-draft-6')
await page.evaluate(() => localStorage.removeItem('paddo-invite-note'))
await page.reload()
await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
await page.getByRole('button', { name: /open padd/i }).click()
await page.locator('.prose h1').first().waitFor()
await page.waitForTimeout(1400)
await page.getByRole('button', { name: 'Invite the agent' }).click()
await page.locator('.sheet').waitFor()
await page.waitForTimeout(500)

const read = async () => page.evaluate(() => ({
  noteVisible: Boolean(document.querySelector('.notice--info')),
  noteBg: document.querySelector('.notice--info') ? getComputedStyle(document.querySelector('.notice--info')).backgroundColor : null,
  restoreButton: Boolean(document.querySelector('[aria-label="Show the note about how this works"]')),
}))
const shown = await read()
await page.screenshot({ path: 'screenshots/note-shown.png', clip: { x: 300, y: 180, width: 620, height: 260 } })

await page.getByRole('button', { name: 'Dismiss this note' }).click()
await page.waitForTimeout(300)
const dismissed = await read()
const stored = await page.evaluate(() => localStorage.getItem('paddo-invite-note'))

await page.addScriptTag({ content: axeSource })
const violations = await page.evaluate(async () => {
  const run = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } })
  return run.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)
})

// Reopening keeps it dismissed; the info button brings it back.
await page.locator('.sheet__close').click()
await page.getByRole('button', { name: 'Invite the agent' }).click()
await page.locator('.sheet').waitFor()
await page.waitForTimeout(400)
const reopened = await read()
await page.getByRole('button', { name: 'Show the note about how this works' }).click()
await page.waitForTimeout(300)
const restored = await read()

console.log(JSON.stringify({ shown, dismissed, stored, reopened, restored, violations, errors }, null, 2))
await browser.close()
