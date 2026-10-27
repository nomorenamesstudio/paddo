/** The whole pairing dance: start, claim by an agent, approve, collect. */
import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const base = 'http://127.0.0.1:4319'
const browser = await chromium.launch()
const page = await (await browser.newContext()).newPage()
await page.goto(base)
await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
await page.getByRole('button', { name: /open padd/i }).click()
await page.locator('.documents').waitFor()

const started = await page.evaluate(async () => {
  const response = await fetch('/api/pair', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'paired probe', verbs: ['read'], documents: ['the-quiet-interface'] }),
  })
  return response.json()
})
const code = started.code

// The agent's side, with no cookie at all.
const claim = async () => {
  const response = await fetch(`${base}/api/pair/claim`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code }),
  })
  return { status: response.status, body: await response.json() }
}

const first = await claim()
const listed = await page.evaluate(async () => (await fetch('/api/pair')).json())
const approved = await page.evaluate(
  async (value) => (await fetch(`/api/pair/${value}/approve`, { method: 'POST' })).json(),
  code,
)
const collected = await claim()
const again = await claim()

// The collected token must work, and only where it was scoped.
const check = async (path) => {
  const response = await fetch(`${base}${path}`, {
    headers: { authorization: `Bearer ${collected.body.token}` },
  })
  return response.status
}
const inScope = await check('/api/documents/the-quiet-interface')
const outOfScope = await check('/api/documents/wow-this-cool')

console.log(JSON.stringify({ code, first, listed, approved, collected: { state: collected.body.state, tokenPrefix: String(collected.body.token).slice(0, 6) }, again, inScope, outOfScope }))
await browser.close()
