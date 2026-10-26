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

  const chip = page.locator('.sug-chip')
  await expect(chip).toBeVisible()
  await expect(page.locator('.bottombar__count')).toContainText('1 pending')

  await chip.locator('.sug-action').first().click()
  await expect(chip).toHaveCount(0)

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

  await page.locator('.sug-chip').first().locator('.sug-action').nth(1).click()
  await expect(page.locator('.bottombar__count')).toContainText('1 pending')

  await page.getByRole('button', { name: 'Accept all' }).click()
  await expect(page.locator('.bottombar')).toHaveCount(0)

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

  await page.locator('.masthead--row .button--icon').click()
  await expect(page.locator('.prose h1')).toHaveText('New draft')
  await expect(page.locator('.topbar__title')).toHaveText('New draft')
  const slug = page.url().split('/d/')[1] ?? ''
  expect(slug).not.toBe('')

  // The heading is the name: type into it and the title follows.
  await page.locator('.prose h1').click()
  await page.keyboard.press('End')
  await page.keyboard.type(' about tides')
  await expect(page.locator('.topbar__title')).toHaveText('New draft about tides')

  await page.selectOption('.status-select', 'published')
  await expect
    .poll(async () => {
      const response = await page.request.get('/api/documents')
      const body = (await response.json()) as { documents: Array<{ slug: string; status: string }> }
      return body.documents.find((document) => document.slug === slug)?.status
    })
    .toBe('published')
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
