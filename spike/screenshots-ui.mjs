/** Visual check for the icon pass: chevron, robot, green sync pill, selection menu. */
import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'

const ORIGIN = 'http://127.0.0.1:4319'
const slug = 'the-quiet-interface'
const env = Object.fromEntries(
  (await readFile(new URL('../.env', import.meta.url), 'utf8'))
    .split('\n')
    .filter((line) => line.includes('='))
    .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
)

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 2 })
const page = await context.newPage()
const problems = []
page.on('pageerror', (error) => problems.push(String(error)))
page.on('console', (message) => {
  if (message.type() === 'error') problems.push(message.text())
})

await page.goto(`${ORIGIN}/d/${slug}`)
await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD ?? '')
await page.getByRole('button', { name: /open padd/i }).click()
await page.locator('.prose h1').waitFor()
await page.waitForTimeout(1200)

const syncColor = await page.locator('.sync').evaluate((node) => {
  const style = window.getComputedStyle(node)
  return { color: style.color, background: style.backgroundColor, text: node.textContent?.trim() }
})
const backIcon = await page.locator('.topbar__back svg').count()
const agentIcon = await page.locator('.topbar .button--icon svg').count()

await page.screenshot({ path: 'screenshots/topbar.png', clip: { x: 0, y: 0, width: 1280, height: 120 } })

// Select a phrase so the formatting menu appears.
await page.evaluate(() => {
  // Flat-text offsets are not document positions; walk the text nodes instead.
  const editor = window.__paddo.editor
  const target = 'Headers are doors.'
  let from = -1
  let to = -1
  editor.state.doc.descendants((node, position) => {
    if (from !== -1 || !node.isText || !node.text) return true
    const index = node.text.indexOf(target)
    if (index === -1) return true
    from = position + index
    to = position + index + target.length
    return false
  })
  if (from === -1) throw new Error('target phrase not found')
  editor.commands.setTextSelection({ from, to })
  editor.commands.focus()
})
await page.locator('.bubble').waitFor({ timeout: 5000 })
const bubbleButtons = await page.locator('.bubble__button').count()
await page.waitForTimeout(300)
await page.screenshot({ path: 'screenshots/selection-menu.png' })

// The link flow must work without a keyboard shortcut.
await page.locator('.bubble__button').nth(2).click()
await page.locator('.bubble__input').waitFor()
await page.waitForTimeout(200)
await page.screenshot({ path: 'screenshots/selection-link.png' })
await page.locator('.bubble__input').fill('https://example.com/notes')
await page.locator('.bubble__button').last().click()
await page.waitForTimeout(300)
const linkApplied = await page.evaluate(() =>
  Boolean(window.__paddo.editor.state.doc.nodeAt(0)) &&
  window.__paddo.editor.getHTML().includes('https://example.com/notes'),
)

// Phone: the same selection menu, tap-sized.
const phone = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  storageState: await context.storageState(),
})
await page.evaluate(() => {
  const editor = window.__paddo.editor
  const target = 'patient and unremarkable'
  let from = -1
  let to = -1
  editor.state.doc.descendants((node, position) => {
    if (from !== -1 || !node.isText || !node.text) return true
    const index = node.text.indexOf(target)
    if (index === -1) return true
    from = position + index
    to = position + index + target.length
    return false
  })
  if (from !== -1) editor.commands.setTextSelection({ from, to })
})

const phonePage = await phone.newPage()
await phonePage.goto(`${ORIGIN}/d/${slug}`)
await phonePage.locator('.prose h1').waitFor()
await phonePage.waitForTimeout(1200)
await phonePage.evaluate(() => {
  const editor = window.__paddo.editor
  const target = 'Headers are doors.'
  let from = -1
  let to = -1
  editor.state.doc.descendants((node, position) => {
    if (from !== -1 || !node.isText || !node.text) return true
    const index = node.text.indexOf(target)
    if (index === -1) return true
    from = position + index
    to = position + index + target.length
    return false
  })
  if (from === -1) throw new Error('target phrase not found')
  editor.commands.setTextSelection({ from, to })
  editor.commands.focus()
  editor.view.dom.scrollIntoView({ block: 'center' })
})
await phonePage.locator('.bubble').waitFor({ timeout: 5000 })
const phoneTargets = await phonePage.evaluate(() =>
  [...document.querySelectorAll('.bubble__button, .topbar__back, .topbar .button--icon')].map((node) => {
    const rect = node.getBoundingClientRect()
    return { label: node.getAttribute('aria-label'), w: Math.round(rect.width), h: Math.round(rect.height) }
  }),
)
await phonePage.waitForTimeout(300)
await phonePage.screenshot({ path: 'screenshots/phone-topbar-menu.png' })

console.log(
  JSON.stringify(
    { syncColor, backIcon, agentIcon, bubbleButtons, linkApplied, phoneTargets, problems: problems.slice(0, 4) },
    null,
    2,
  ),
)

await browser.close()
