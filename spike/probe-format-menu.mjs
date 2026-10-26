/** Selection menu (quote + headings) and peer device icons, on a throwaway document. */
import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))

const browser = await chromium.launch()
const deskContext = await browser.newContext({ viewport: { width: 1180, height: 900 }, deviceScaleFactor: 2 })
const phoneContext = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
})

async function signIn(page) {
  await page.goto('http://127.0.0.1:4319/')
  await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
  await page.getByRole('button', { name: /open padd/i }).click()
  await page.locator('.documents').waitFor()
}

const desk = await deskContext.newPage()
await signIn(desk)

const slug = await desk.evaluate(async () => {
  const response = await fetch('/api/documents', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: `zz probe menu ${Date.now()}` }),
  })
  return (await response.json()).slug
})

await desk.goto(`http://127.0.0.1:4319/d/${slug}`)
await desk.locator('.prose h1').first().waitFor()
await desk.waitForTimeout(1200)
await desk.locator('.prose p').last().click()
await desk.keyboard.type('A paragraph worth quoting. Headers are doors.')
await desk.waitForTimeout(800)

// The phone joins the same document so the desk sees a peer caret.
const phone = await phoneContext.newPage()
await signIn(phone)
await phone.goto(`http://127.0.0.1:4319/d/${slug}`)
await phone.locator('.prose h1').first().waitFor()
await phone.waitForTimeout(1800)


const select = async (page, phrase) => {
  await page.evaluate((target) => {
    const editor = window.__paddo.editor
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
    if (from === -1) throw new Error(`phrase not found: ${target}`)
    editor.commands.setTextSelection({ from, to })
    editor.commands.focus()
  }, phrase)
  await page.waitForTimeout(250)
}

await select(desk, 'Headers are doors')
const buttons = await desk.locator('.bubble__button').evaluateAll((nodes) =>
  nodes.map((node) => node.getAttribute('aria-label')),
)
await desk.screenshot({ path: 'screenshots/menu-format.png' })

await desk.locator('.bubble__button[aria-label="Blockquote"]').click()
await desk.waitForTimeout(300)
const quoted = await desk.evaluate(() =>
  window.__paddo.editor.state.doc.content.content.some(
    (node) => node.type.name === 'blockquote' && node.textContent.includes('Headers are doors'),
  ),
)

await select(desk, 'A paragraph worth quoting')
await desk.locator('.bubble__button[aria-label="Headings"]').click()
await desk.waitForTimeout(200)
const headingRow = await desk.locator('.bubble__button').evaluateAll((nodes) =>
  nodes.map((node) => node.getAttribute('aria-label')),
)
await desk.screenshot({ path: 'screenshots/menu-headings.png' })

await desk.locator('.bubble__button[aria-label="Heading 2"]').click()
await desk.waitForTimeout(300)
const headingApplied = await desk.evaluate(() => {
  let level = null
  window.__paddo.editor.state.doc.descendants((node) => {
    if (node.type.name === 'heading' && node.attrs.level === 2) level = 2
    return true
  })
  return level === 2
})

await select(phone, 'A paragraph worth quoting')
await phone.waitForTimeout(900)
const labels = await desk.evaluate(() =>
  [...document.querySelectorAll('.collaboration-carets__label')].map((node) => ({
    icons: node.querySelectorAll('svg').length,
    text: node.textContent?.trim() ?? '',
    icon: node.querySelector('svg')?.outerHTML.includes('rect width="20"') ? 'monitor' : 'smartphone',
  })),
)
await desk.screenshot({ path: 'screenshots/peer-icon.png' })
const phoneTargets = await phone.locator('.bubble__button').evaluateAll((nodes) =>
  nodes.map((node) => {
    const rect = node.getBoundingClientRect()
    return { label: node.getAttribute('aria-label'), w: Math.round(rect.width), h: Math.round(rect.height) }
  }),
)
const phoneWidth = await phone.locator('.bubble').evaluate((node) => Math.round(node.getBoundingClientRect().width))
await phone.screenshot({ path: 'screenshots/menu-phone.png' })

console.log(JSON.stringify({ slug, labels, buttons, quoted, headingRow, headingApplied, phoneTargets, phoneWidth }, null, 2))
await browser.close()
