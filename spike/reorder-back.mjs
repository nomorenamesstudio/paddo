/** Put the demo document's blocks back in the committed order, via the editor's own move. */
import { readFile } from 'node:fs/promises'
import { execSync } from 'node:child_process'
import { chromium } from '@playwright/test'

const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))

const wanted = execSync('git show HEAD:content/the-quiet-interface.md', { encoding: 'utf8' })
  .split('\n\n')
  .map((chunk) => chunk.trim())
  .filter(Boolean)
  .map((chunk) => chunk.split('\n')[0].replace(/^[#>\s]+/, '').replace(/[_*]/g, '').slice(0, 26))

const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1280, height: 1000 } })).newPage()
page.on('pageerror', (e) => console.log('[pageerror]', String(e)))
await page.goto('http://127.0.0.1:4319/d/the-quiet-interface')
await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
await page.getByRole('button', { name: /open padd/i }).click()
await page.locator('.prose h1').first().waitFor()
await page.waitForTimeout(1500)

const blocks = () => page.locator('.prose > *')

async function order() {
  return blocks().evaluateAll((nodes) =>
    nodes.map((n) => (n.textContent ?? '').trim().replace(/[_*]/g, '').slice(0, 26)),
  )
}

async function moveBlockTo(fromText, beforeText) {
  const current = await order()
  const from = current.findIndex((t) => t.startsWith(fromText))
  const before = current.findIndex((t) => t.startsWith(beforeText))
  if (from === -1 || before === -1) return `missing ${fromText} / ${beforeText}`

  await blocks().nth(from).hover()
  const grip = page.locator('.grip')
  const g = await grip.boundingBox()
  const target = await blocks().nth(before).boundingBox()
  if (!g || !target) return 'no geometry'

  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2)
  await page.mouse.down()
  await page.mouse.move(target.x + target.width / 2, target.y + 2, { steps: 14 })
  await page.mouse.up()
  await page.waitForTimeout(600)
  return 'moved'
}

console.log('wanted:', wanted)
console.log('start :', await order())

// Iterate: place each wanted block in front of the block that should follow it.
for (let guard = 0; guard < 12; guard += 1) {
  const current = await order()
  const mismatch = wanted.findIndex((text, index) => !current[index]?.startsWith(text))
  if (mismatch === -1) break
  const text = wanted[mismatch]
  const follower = wanted[mismatch + 1]
  const result = follower
    ? await moveBlockTo(text, follower)
    : await moveBlockTo(text, wanted[wanted.length - 1])
  console.log('step:', text, '->', result)
  if (result !== 'moved') break
}

await page.waitForTimeout(1500)
console.log('final :', await order())
await browser.close()
