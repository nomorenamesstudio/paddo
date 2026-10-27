/**
 * Three directions for the header, injected as CSS on the live page so nothing is
 * rebuilt: flat chrome, bolder sheet, editorial.
 */
import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))

const VARIANTS = {
  now: '',
  flat: `
    .masthead--row { border: 0; box-shadow: 0 1px 1px rgba(0,0,0,.04), 0 14px 30px rgba(42,40,37,.08); }
    .search__input { border-color: transparent; background: color-mix(in srgb, #000 3%, var(--bg)); }
    .masthead__actions .button--icon { border-color: transparent; color: var(--muted); }
    .masthead__actions .button--icon:hover { color: var(--fg); background: color-mix(in srgb, #000 4%, transparent); }
  `,
  bold: `
    .masthead--row { border: 0; border-radius: 20px; background: #fffdf9;
      box-shadow: 0 2px 4px rgba(42,40,37,.06), 0 22px 44px rgba(42,40,37,.12); }
    .search__input { border-color: color-mix(in srgb, #000 6%, transparent); }
    .masthead__actions .button--icon { border: 0; background: color-mix(in srgb, var(--fg) 6%, transparent); }
  `,
  editorial: `
    .masthead--row { border: 0; border-radius: 6px; background: transparent; box-shadow: none;
      border-bottom: 1px solid var(--line); padding: 0 0 .5rem; }
    .search__input { border: 0; border-radius: 0; background: transparent; padding-left: 1.9rem; }
    .search__icon { left: 0; }
    .masthead__actions .button--icon { border-color: transparent; }
    .wordmark svg { height: 1.55rem; }
  `,
}

const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1180, height: 800 }, deviceScaleFactor: 2 })).newPage()
await page.goto('http://127.0.0.1:4319/')
await page.locator('input[type="password"]').fill(env.PADDO_PASSWORD)
await page.getByRole('button', { name: /open padd/i }).click()
await page.locator('.documents').waitFor()
await page.waitForTimeout(500)

for (const [name, css] of Object.entries(VARIANTS)) {
  await page.evaluate(() => {
    for (const id of ['look-a', 'look-b']) document.getElementById(id)?.remove()
  })
  if (css) await page.addStyleTag({ content: css })
  await page.waitForTimeout(200)
  await page.screenshot({ path: `screenshots/look-${name}.png`, clip: { x: 300, y: 0, width: 580, height: 210 } })
  console.log('shot', name)
}
await browser.close()
