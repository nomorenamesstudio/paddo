import { readFile } from 'node:fs/promises'

import { expect, test, type Page } from '@playwright/test'

/**
 * The integration contract nothing else covers: a person signs in, types, an
 * agent proposal arrives, and accepting it reaches the markdown file on disk.
 * Every test creates its own document so the suite can run against a real server
 * without depending on order or leftovers.
 */

const PASSWORD = process.env.E2E_PASSWORD ?? ''

async function signIn(page: Page) {
  await page.goto('/')
  await page.locator('input[type="password"]').fill(PASSWORD)
  await page.getByRole('button', { name: /open padd/i }).click()
  await expect(page.locator('.documents')).toBeVisible()
}

async function createDocument(page: Page, title: string): Promise<string> {
  const slug = await page.evaluate(async (name) => {
    const response = await fetch('/api/documents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    const body = (await response.json()) as { slug: string }
    return body.slug
  }, title)
  return slug
}

test('the wrong password is refused, the right one gets in', async ({ page }) => {
  await page.goto('/')
  await page.locator('input[type="password"]').fill('not-the-password')
  await page.getByRole('button', { name: /open padd/i }).click()
  await expect(page.locator('.notice--error')).toBeVisible()
  await expect(page.locator('.documents')).toHaveCount(0)

  await page.locator('input[type="password"]').fill(PASSWORD)
  await page.getByRole('button', { name: /open padd/i }).click()
  await expect(page.locator('.documents')).toBeVisible()
})

test('typing reaches the markdown file', async ({ page }) => {
  await signIn(page)
  const slug = await createDocument(page, `Typed ${Date.now()}`)
  await page.goto(`/d/${slug}`)
  await expect(page.locator('.prose h1')).toBeVisible()

  const sentence = 'A sentence typed in the browser.'
  await page.locator('.prose p').last().click()
  await page.keyboard.type(sentence)

  await expect
    .poll(async () => {
      const file = await readFile(`tests/fixtures/content/${slug}.md`, 'utf8').catch(() => '')
      return file.includes(sentence)
    }, { timeout: 15_000 })
    .toBe(true)
})

test('a proposal is reviewed inline and applied to the file', async ({ page }) => {
  await signIn(page)
  const slug = await createDocument(page, `Reviewed ${Date.now()}`)
  await page.goto(`/d/${slug}`)
  await expect(page.locator('.prose h1')).toBeVisible()

  const original = 'Most software fights this moment.'
  const proposed = 'Most software fights this moment, and loses.'
  await page.locator('.prose p').last().click()
  await page.keyboard.type(original)

  const created = await page.evaluate(
    async ({ slug, original, proposed }) => {
      const response = await fetch(`/api/documents/${slug}/suggestions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ edits: [{ original, proposed, rationale: 'Sharpens the claim.' }] }),
      })
      return (await response.json()) as { created: unknown[]; errors: unknown[] }
    },
    { slug, original, proposed },
  )
  expect(created.created).toHaveLength(1)

  const hunk = page.locator('.sug-hunk')
  await expect(hunk).toBeVisible()
  await expect(page.locator('.bottombar__count')).toContainText('1 pending')

  // Every hunk carries its reason and all three actions, whatever its size: a
  // compact change that drops the rationale is the regression this guards.
  await expect(hunk.locator('.sug-rationale')).toHaveText('Sharpens the claim.')
  await expect(hunk.locator('.sug-original')).toBeVisible()
  await expect(hunk.locator('.sug-proposed')).toBeVisible()
  await expect(hunk.locator('.sug-action')).toHaveCount(3)

  await hunk.locator('.sug-action').first().click()
  await expect(hunk).toHaveCount(0)

  await expect
    .poll(async () => {
      const file = await readFile(`tests/fixtures/content/${slug}.md`, 'utf8').catch(() => '')
      return file.includes(proposed)
    }, { timeout: 15_000 })
    .toBe(true)
})

test('rejecting one hunk and accepting the rest lands only the accepted text', async ({ page }) => {
  await signIn(page)
  const slug = await createDocument(page, `Batch ${Date.now()}`)
  await page.goto(`/d/${slug}`)
  await expect(page.locator('.prose h1')).toBeVisible()

  const body = 'Alpha sentence stays. Beta sentence is replaced.'
  await page.locator('.prose p').last().click()
  await page.keyboard.type(body)

  await page.evaluate(
    async ({ slug }) => {
      await fetch(`/api/documents/${slug}/suggestions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          edits: [
            { original: 'Alpha sentence stays.', proposed: 'Alpha sentence is kept.', rationale: 'Tighten.' },
            { original: 'Beta sentence is replaced.', proposed: 'Beta sentence gets rewritten words.', rationale: 'Vary.' },
          ],
        }),
      })
    },
    { slug, body },
  )

  await expect(page.locator('.bottombar__count')).toContainText('2 pending')

  await page.locator('.sug-hunk').first().locator('.sug-action').nth(1).click()
  await expect(page.locator('.bottombar__count')).toContainText('1 pending')

  const bar = page.locator('.bottombar')
  const barBox = await bar.boundingBox()
  const viewport = page.viewportSize() ?? { width: 0, height: 0 }
  expect(await bar.evaluate((node) => getComputedStyle(node).position)).toBe('fixed')
  expect(barBox && barBox.y + barBox.height <= viewport.height + 1).toBe(true)

  await page.getByRole('button', { name: 'Accept all' }).click()
  await expect(bar).toHaveCount(0)

  const text = await page.locator('.prose').innerText()
  expect(text).toContain('Beta sentence gets rewritten words.')
  expect(text).toContain('Alpha sentence stays.')
  expect(text).not.toContain('Alpha sentence is kept.')
})

test('a paragraph moves by dragging its grip and comes back with one undo', async ({ page }) => {
  await signIn(page)
  const slug = await createDocument(page, `Moving ${Date.now()}`)
  await page.goto(`/d/${slug}`)
  await expect(page.locator('.prose h1')).toBeVisible()

  await page.locator('.prose p').last().click()
  await page.keyboard.type('First block stays here.')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Second block should move up.')
  await expect(page.locator('.prose > p')).toHaveCount(2)

  const order = async () => (await page.locator('.prose > p').allInnerTexts()).map((text) => text.trim())
  // The CRDT undo manager groups changes within half a second; a person does not
  // type and immediately drag, and the test should not either.
  await page.waitForTimeout(700)
  const before = await order()

  // Drag the second block's grip to the top of the first block.
  await page.locator('.prose > p').nth(1).hover()
  const grip = page.locator('.grip')
  await expect(grip).toBeVisible()
  const gripBox = await grip.boundingBox()
  const firstBox = await page.locator('.prose > p').first().boundingBox()
  if (!gripBox || !firstBox) throw new Error('missing geometry')

  await page.mouse.move(gripBox.x + gripBox.width / 2, gripBox.y + gripBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(firstBox.x + firstBox.width / 2, firstBox.y + 4, { steps: 10 })

  // While the pointer is down the block travels and the destination opens a gap.
  await expect(page.locator('.prose .is-dragging')).toHaveCount(1)
  await expect(page.locator('.prose .is-drop-target')).toHaveCount(1)
  await page.mouse.up()

  await expect.poll(order).toEqual([before[1], before[0]])

  await page.locator('.prose').click()
  await page.keyboard.press('Control+z')
  await expect.poll(order).toEqual(before)
})

test('a new draft is named by its heading, and its status sticks', async ({ page }) => {
  await signIn(page)

  await page.getByRole('button', { name: 'New document' }).click()
  await expect(page.locator('.prose h1')).toHaveText('New draft')
  await expect(page.locator('.topbar__title')).toHaveText('New draft')
  const slug = page.url().split('/d/')[1] ?? ''
  expect(slug).not.toBe('')

  // The heading is the name: type into it and the title follows.
  await page.locator('.prose h1').click()
  await page.keyboard.press('End')
  await page.keyboard.type(' about tides')
  await expect(page.locator('.topbar__title')).toHaveText('New draft about tides')

  await page.locator('.status button').click()
  await page.locator('.status__item', { hasText: 'Published' }).click()
  await expect
    .poll(async () => {
      const response = await page.request.get('/api/documents')
      const body = (await response.json()) as { documents: Array<{ slug: string; status: string }> }
      return body.documents.find((document) => document.slug === slug)?.status
    })
    .toBe('published')
})

test('a document can be archived and then deleted from the list', async ({ page }) => {
  await signIn(page)
  const slug = await createDocument(page, `Throwaway ${Date.now()}`)
  await page.goto('/')
  await expect(page.locator('.documents')).toBeVisible()

  const statusOf = async (target: string) => {
    const response = await page.request.get('/api/documents')
    const body = (await response.json()) as { documents: Array<{ slug: string; status: string }> }
    return body.documents.find((document) => document.slug === target)?.status
  }

  const row = page.locator(`.documents__item:has(a[href="/d/${slug}"])`)
  await expect(row).toHaveCount(1)

  await row.locator('.row-menu__trigger').click()
  await page.locator('.row-menu__item', { hasText: 'Archive' }).click()
  await expect.poll(() => statusOf(slug)).toBe('archived')

  // Archiving moves the row into the collapsed section below the list, where the
  // menu offers the way back instead of the status it already has.
  await expect(page.locator('.archive')).toBeVisible()
  await page.locator('.archive__summary').click()
  await expect(row).toBeVisible()
  await row.locator('.row-menu__trigger').click()
  await expect(page.locator('.row-menu__item', { hasText: 'Restore' })).toBeVisible()
  await page.keyboard.press('Escape')

  // Deleting asks once, in place, before it does anything.
  await row.locator('.row-menu__trigger').click()
  await page.locator('.row-menu__item', { hasText: 'Delete' }).click()
  await page.locator('.row-menu__item--danger.is-confirming').click()

  await expect(row).toHaveCount(0)
  await expect.poll(() => statusOf(slug)).toBeUndefined()
})

test('a writing guide saved in settings reaches the agent invitation', async ({ page }) => {
  await signIn(page)

  // The guide lives in settings, not in a document.
  await page.goto('/settings')
  const guide = page.getByLabel('Writing guide')
  await expect(guide).toBeVisible()
  await guide.fill('Never use the word leverage. Short sentences. Em dashes are fine.')
  await page.getByRole('button', { name: 'Save guide' }).click()
  await expect(page.locator('.settings__saved')).toBeVisible()

  // And it travels with the prompt the writer copies into their agent session.
  const slug = await createDocument(page, `Guide check ${Date.now()}`)
  await page.goto(`/d/${slug}`)
  await page.locator('.prose h1').first().waitFor()
  await page.getByRole('button', { name: 'Invite the agent' }).click()
  const sheet = page.locator('.sheet')
  await expect(sheet).toBeVisible()
  const sheetBox = await sheet.boundingBox()
  const size = page.viewportSize() ?? { width: 0, height: 0 }
  expect(await sheet.evaluate((node) => getComputedStyle(node).position)).toBe('fixed')
  expect(sheetBox?.height).toBeGreaterThanOrEqual(size.height - 1)

  const prompt = page.locator('.sheet__prompt')
  await expect(prompt).toContainText('Writing guide (from Paddō settings)')
  await expect(prompt).toContainText('Never use the word leverage.')

  // The guide is optional per invitation: untick it and the prompt drops it.
  await page.getByRole('checkbox', { name: /Include the writing guide/ }).uncheck()
  await expect(prompt).not.toContainText('Writing guide (from Paddō settings)')
  await page.getByRole('checkbox', { name: /Include the writing guide/ }).check()
  await expect(prompt).toContainText('Writing guide (from Paddō settings)')
})

test('the theme is a saved choice, and switching it keeps the writing guide', async ({ page }) => {
  await signIn(page)
  await page.goto('/settings')
  const guide = page.getByLabel('Writing guide')
  await guide.fill('Keep the guide while the theme changes.')
  await page.getByRole('button', { name: 'Save guide' }).click()
  await expect(page.locator('.settings__saved')).toBeVisible()

  await page.getByRole('radio', { name: 'Dark' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

  // The theme and the guide travel in one record, so a saved theme must not wipe
  // the guide — and the choice has to survive a reload.
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.getByLabel('Writing guide')).toHaveValue('Keep the guide while the theme changes.')

  await page.getByRole('radio', { name: 'System' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme-setting', 'system')
})

test('no serious accessibility violations on the main surfaces', async ({ page }) => {
  await signIn(page)
  const axe = await readFile(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8')

  const audit = async (label: string) => {
    await page.addScriptTag({ content: axe })
    const violations = (await page.evaluate(async () => {
      const run = await (window as unknown as {
        axe: { run: (context: Document, options: unknown) => Promise<{ violations: Array<{ id: string; impact: string | null; nodes: unknown[] }> }> }
      }).axe.run(document, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
      })
      return run.violations
        .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
        .map((violation) => `${violation.id} (${violation.nodes.length})`)
    }))
    expect(violations, `${label}: ${violations.join(', ')}`).toEqual([])
  }

  await audit('documents')

  const slug = await createDocument(page, `A11y check ${Date.now()}`)
  await page.goto(`/d/${slug}`)
  await page.locator('.prose h1').first().waitFor()
  // Audit the settled page: the loading state is a crossfade, not a resting state.
  await expect(page.locator('.loading')).toHaveCount(0)
  await page.waitForTimeout(300)
  await audit('editor')

  await page.getByRole('button', { name: 'Invite the agent' }).click()
  await expect(page.locator('.sheet')).toBeVisible()
  await audit('invite sheet')

  // Dark mode swaps every token, so it gets its own pass.
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'dark'
  })
  await audit('invite sheet, dark')
})

test('a websocket without a session is refused', async ({ browser }) => {
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto('/')

  const outcome = await page.evaluate(
    () =>
      new Promise<string>((resolve) => {
        const socket = new WebSocket(`ws://${window.location.host}`)
        const timer = setTimeout(() => resolve('stayed-open'), 5000)
        // A refused upgrade surfaces as either an error or a close, depending on
        // the browser; the contract is that the socket never becomes usable.
        socket.onclose = () => {
          clearTimeout(timer)
          resolve('refused')
        }
        socket.onerror = () => {
          clearTimeout(timer)
          resolve('refused')
        }
      }),
  )

  await context.close()
  expect(outcome).toBe('refused')
})
