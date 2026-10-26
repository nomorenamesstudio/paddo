/** Is the other device's cursor a bookmark, or does it block anything? */
import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))

const browser = await chromium.launch()
const open = async (name) => {
  const context = await browser.newContext({ viewport: { width: 1100, height: 900 } })
  const page = await context.newPage()
  await page.goto('http://127.0.0.1:4319/d/the-quiet-interface')
  await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
  await page.getByRole('button', { name: /open padd/i }).click()
  await page.locator('.prose h1').first().waitFor()
  await page.waitForTimeout(1200)
  console.log(`${name}: caret label`, await page.locator('.collaboration-carets__label').allInnerTexts())
  return page
}

const desk = await open('desk')
const phone = await open('phone')

// Phone selects a paragraph; desk types somewhere else.
await phone.evaluate(() => {
  const editor = window.__paddo.editor
  const target = 'A calm surface is not a lack of power.'
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
  editor.commands.setTextSelection({ from, to })
})
await phone.waitForTimeout(500)

console.log('desk sees phone label:', await desk.locator('.collaboration-carets__label').allInnerTexts())
console.log('desk sees a peer selection:', await desk.locator('.ProseMirror-yjs-selection').count())

// Typing on the desk must not be blocked by the phone's selection.
const before = await desk.evaluate(() => window.__paddo.editor.getText().length)
await desk.locator('.prose p').last().click()
await desk.keyboard.press('End')
await desk.keyboard.type(' Typed while the phone was watching.')
await desk.waitForTimeout(1500)
const deskLen = await desk.evaluate(() => window.__paddo.editor.getText().length)
const phoneLen = await phone.evaluate(() => window.__paddo.editor.getText().length)
const phoneSees = await phone.evaluate(() => window.__paddo.editor.getText().includes('Typed while the phone was watching.'))

// The phone's selection must still be where it was, not dragged along.
const phoneSelection = await phone.evaluate(() => {
  const { from, to } = window.__paddo.editor.state.selection
  return { from, to, text: window.__paddo.editor.state.doc.textBetween(from, to, ' ') }
})

// Closing the phone must not touch the document.
await phone.context().close()
await desk.waitForTimeout(1200)
const afterClose = await desk.evaluate(() => ({
  labels: document.querySelectorAll('.collaboration-carets__label').length,
  selections: document.querySelectorAll('.ProseMirror-yjs-selection').length,
  textLength: window.__paddo.editor.getText().length,
}))

console.log(JSON.stringify({ before, deskLen, phoneLen, phoneSees, phoneSelection, afterClose }, null, 2))
await browser.close()
