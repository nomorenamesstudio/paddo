import { readFile } from 'node:fs/promises'

import { expect, request, test, type Page } from '@playwright/test'

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

  // Status lives in the list's kebab menu now. Leaving the editor renames the file to
  // its title, so the row is found by title rather than by the slug it was born with.
  await page.goto('/')
  await expect(page.locator('.documents')).toBeVisible()
  // The fixture folder keeps documents from earlier runs, so match the title exactly
  // rather than filtering on a substring of every row.
  const row = page
    .locator('.documents__item')
    .filter({ has: page.locator('.documents__title', { hasText: /^New draft about tides$/ }) })
  await expect(row).toHaveCount(1)
  await row.locator('.row-menu__trigger').click()
  await page.locator('.row-menu__item', { hasText: 'Published' }).click()
  await expect
    .poll(async () => {
      const response = await page.request.get('/api/documents')
      const body = (await response.json()) as { documents: Array<{ title: string; status: string }> }
      return body.documents.find((document) => document.title === 'New draft about tides')?.status
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

  // The guide lives in settings, not in a document — and it is read-only until asked,
  // so a misclick cannot rewrite the brief the agent works from.
  await page.goto('/settings')
  await expect(page.getByLabel('Writing guide')).toHaveCount(0)
  await page.getByRole('button', { name: 'Edit guide' }).click()
  const guide = page.getByLabel('Writing guide')
  await expect(guide).toBeVisible()
  await guide.fill('Never use the word leverage. Short sentences. Em dashes are fine.')
  await page.getByRole('button', { name: 'Save guide' }).click()
  await expect(page.locator('.settings__saved')).toBeVisible()
  // Saving closes the editor again.
  await expect(page.getByLabel('Writing guide')).toHaveCount(0)
  await expect(page.locator('.settings__guideview')).toContainText('Never use the word leverage')

  // And it travels with the prompt the writer copies into their agent session.
  const slug = await createDocument(page, `Guide check ${Date.now()}`)
  await page.goto(`/d/${slug}`)
  await page.locator('.prose h1').first().waitFor()
  await page.locator('.editor-menu__trigger').click()
  await page.getByRole('menuitem', { name: 'Invite the agent' }).click()
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

  // The "this does not run a model" note is an info box you can put away for good,
  // and the info button in the header is the way back.
  await page.getByRole('button', { name: 'Dismiss this note' }).click()
  await expect(page.locator('.notice--info')).toHaveCount(0)
  await page.reload()
  await page.locator('.prose h1').first().waitFor()
  await page.locator('.editor-menu__trigger').click()
  await page.getByRole('menuitem', { name: 'Invite the agent' }).click()
  await expect(page.locator('.notice--info')).toHaveCount(0)
  await page.getByRole('button', { name: 'Show the note about how this works' }).click()
  await expect(page.locator('.notice--info')).toBeVisible()
})

test('a draft takes its title as its filename once it is closed', async ({ page }) => {
  await signIn(page)
  const marker = `Renamed By Test ${Date.now()}`
  const expectedSlug = marker.toLowerCase().replace(/[^a-z0-9]+/g, '-')

  await page.getByRole('button', { name: 'New document' }).click()
  await page.locator('.prose h1').first().waitFor()
  const bornSlug = page.url().split('/d/')[1] ?? ''
  expect(bornSlug).toMatch(/^new-draft/)

  // Name it through the heading, let it store, then leave so the room unloads.
  await page.locator('.prose h1').click()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type(marker)
  await page.waitForTimeout(900)
  await page.goto('/')
  await expect(page.locator('.documents')).toBeVisible()

  // The file on disk is named after the title, not the name it was born with.
  await expect
    .poll(async () => {
      const response = await page.request.get('/api/documents')
      const body = (await response.json()) as { documents: Array<{ slug: string; title: string }> }
      return body.documents.some((document) => document.slug === expectedSlug)
    }, { timeout: 15000 })
    .toBe(true)
  await expect
    .poll(async () => {
      const response = await page.request.get('/api/documents')
      const body = (await response.json()) as { documents: Array<{ slug: string }> }
      return body.documents.some((document) => document.slug === bornSlug)
    })
    .toBe(false)

  // And the row goes to the new URL.
  const row = page.locator(`.documents__item:has(a[href="/d/${expectedSlug}"])`)
  await expect(row).toHaveCount(1)
  await expect(row.locator('.documents__title')).toHaveText(marker)
})

test('the search box filters the list by title and clears back', async ({ page }) => {
  await signIn(page)
  const marker = `Findable${Date.now()}`
  const slug = await createDocument(page, marker)
  await page.goto('/')
  await expect(page.locator('.documents')).toBeVisible()

  const row = page.locator(`.documents__item:has(a[href="/d/${slug}"])`)
  const search = page.getByLabel('Search documents')

  await search.fill(marker.toLowerCase())
  await expect(row).toHaveCount(1)
  await expect(row.locator('.documents__title')).toHaveText(marker)

  await search.fill('nothing-matches-this')
  await expect(page.locator('.documents__item')).toHaveCount(0)
  await expect(page.locator('.documents__empty')).toContainText('Nothing matches')

  await page.getByRole('button', { name: 'Clear search' }).click()
  await expect(row).toHaveCount(1)

  // The slug is not a searchable name: a document called "Flux Capacitor…" has the
  // slug "flux-capacitor…", and searching the dashed form must find nothing.
  const spaced = `Flux Capacitor${Date.now()}`
  const spacedSlug = await createDocument(page, spaced)
  await page.goto('/')
  await expect(page.locator('.documents')).toBeVisible()
  await page.getByLabel('Search documents').fill(spacedSlug.replace(/[0-9]+$/, ''))
  await expect(page.locator(`.documents__item:has(a[href="/d/${spacedSlug}"])`)).toHaveCount(0)
  await page.getByLabel('Search documents').fill(spaced.split(' ')[0]!.toLowerCase())
  await expect(page.locator(`.documents__item:has(a[href="/d/${spacedSlug}"])`)).toHaveCount(1)
})

test('the theme is a saved choice, and switching it keeps the writing guide', async ({ page }) => {
  await signIn(page)
  await page.goto('/settings')
  await page.getByRole('button', { name: 'Edit guide' }).click()
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
  await expect(page.locator('.settings__guideview')).toHaveText('Keep the guide while the theme changes.')

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
        axe: {
          run: (
            context: Document,
            options: unknown,
          ) => Promise<{
            violations: Array<{
              id: string
              impact: string | null
              nodes: Array<{ target: string[]; failureSummary?: string }>
            }>
          }>
        }
      }).axe.run(document, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
      })
      return run.violations
        .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
        .map(
          (violation) =>
            `${violation.id}: ${violation.nodes.length} node(s) — ${violation.nodes
              .slice(0, 3)
              .map((node) => `${node.target.join(' ')} [${(node.failureSummary ?? '').replace(/\s+/g, ' ').slice(0, 190)}]`)
              .join(', ')}`,
        )
    }))
    expect(violations, `${label}: ${violations.join(', ')}`).toEqual([])
  }

  // The list fades in; axe composites the text against the ancestor's opacity, so audit
  // the settled page rather than a half-transparent one.
  await page
    .locator('.documents')
    .evaluate((node) => Promise.all(node.getAnimations().map((animation) => animation.finished)))
  await audit('documents')

  const slug = await createDocument(page, `A11y check ${Date.now()}`)
  await page.goto(`/d/${slug}`)
  await page.locator('.prose h1').first().waitFor()
  // Audit the settled page: the loading state is a crossfade, not a resting state.
  await expect(page.locator('.loading')).toHaveCount(0)
  await page.waitForTimeout(300)
  await audit('editor')

  await page.locator('.editor-menu__trigger').click()
  await page.getByRole('menuitem', { name: 'Invite the agent' }).click()
  await expect(page.locator('.sheet')).toBeVisible()
  await audit('invite sheet')

  // Dark mode swaps every token, so it gets its own pass.
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'dark'
  })
  await audit('invite sheet, dark')
})

test('the document menu offers the invitation and the file itself', async ({ page }) => {
  await signIn(page)
  const slug = await createDocument(page, `Download ${Date.now()}`)
  await page.goto(`/d/${slug}`)
  await expect(page.locator('.prose h1')).toBeVisible()

  await page.locator('.editor-menu__trigger').click()
  const panel = page.locator('.editor-menu .row-menu__panel')
  await expect(panel).toBeVisible()
  await expect(panel.getByRole('menuitem')).toHaveText(['Invite the agent', 'Download markdown'])

  // The anchor has to carry the real file, named after the document.
  const download = page.waitForEvent('download')
  await panel.getByRole('menuitem', { name: 'Download markdown' }).click()
  const file = await download
  expect(file.suggestedFilename()).toBe(`${slug}.md`)
  const path = await file.path()
  expect(path).not.toBeNull()
  expect(await readFile(path!, 'utf8')).toContain('# Download ')
})

test('a scoped token reaches its own documents and nothing else', async ({ page, baseURL }) => {
  await signIn(page)
  const mine = await createDocument(page, `Mine ${Date.now()}`)
  const other = await createDocument(page, `Other ${Date.now()}`)

  const minted = await page.request.post('/api/tokens', {
    data: { name: 'scoped agent', verbs: ['read', 'propose', 'create'], documents: [mine] },
  })
  expect(minted.ok()).toBe(true)
  const { secret } = (await minted.json()) as { secret: string }

  // A bare context: page.request would carry the session cookie, and the owner's
  // own session is allowed everything — the token has to be judged on its own.
  const agent = await request.newContext({
    baseURL,
    extraHTTPHeaders: { authorization: `Bearer ${secret}` },
  })
  try {
    expect((await agent.get(`/api/documents/${mine}`)).status()).toBe(200)
    expect((await agent.get(`/api/documents/${other}`)).status()).toBe(403)

    // The list is filtered, not merely guarded.
    const listed = (await (await agent.get('/api/documents')).json()) as {
      documents: Array<{ slug: string }>
    }
    expect(listed.documents.map((document) => document.slug)).toEqual([mine])

    // A document the token creates joins its scope, so it can read it back.
    const created = await agent.post('/api/documents', {
      data: { markdown: `# Dropped by agent ${Date.now()}\n\nBody.\n` },
    })
    expect(created.ok()).toBe(true)
    const { slug: dropped } = (await created.json()) as { slug: string }
    expect((await agent.get(`/api/documents/${dropped}`)).status()).toBe(200)

    // Token management is the owner's screen alone.
    expect((await agent.get('/api/tokens')).status()).toBe(401)

    // The same token is the whole MCP connection: the tools are served here, so
    // nothing is installed next to the agent.
    const mcp = await request.newContext({
      baseURL: `${baseURL}/mcp`,
      extraHTTPHeaders: {
        authorization: `Bearer ${secret}`,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
    })
    try {
      const initialize = await mcp.post('', {
        data: {
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'test', version: '1' },
          },
        },
      })
      expect(initialize.status()).toBe(200)
      expect((await initialize.json()).result.serverInfo.name).toBe('paddo')

      const tools = await mcp.post('', { data: { jsonrpc: '2.0', id: 2, method: 'tools/list' } })
      const names = ((await tools.json()).result.tools as Array<{ name: string }>).map((tool) => tool.name)
      expect(names).toContain('propose_edits')
      expect(names).toContain('get_writing_guide')

      // The guide is reachable with the token alone: an agent must not need the disk.
      const guide = await agent.get('/api/settings/guide')
      expect(guide.status()).toBe(200)
      expect(await guide.json()).toHaveProperty('writingGuide')
      // But the rest of the settings stay the owner's.
      expect((await agent.get('/api/settings')).status()).toBe(401)

      // Scope is enforced behind the tool, not just at the transport.
      const refused = await mcp.post('', {
        data: {
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: { name: 'read_document', arguments: { document: other } },
        },
      })
      const body = await refused.json()
      expect(body.result.isError).toBe(true)
      expect(body.result.content[0].text).toContain('no access')
    } finally {
      await mcp.dispose()
    }
  } finally {
    await agent.dispose()
  }
})

test('pairing hands a token to an agent only after the writer approves, and it collects again', async ({
  page,
  baseURL,
}) => {
  await signIn(page)
  const mine = await createDocument(page, `Paired ${Date.now()}`)

  const started = await page.request.post('/api/pair', {
    data: { name: 'paired agent', verbs: ['read'], documents: [mine] },
  })
  expect(started.ok()).toBe(true)
  const { code } = (await started.json()) as { code: string }

  // The agent has no cookie: the code is its only credential, and it is not the token.
  const agent = await request.newContext({ baseURL })
  try {
    const claim = await agent.post('/api/pair/claim', { data: { code } })
    expect(claim.status()).toBe(202)
    const pending = (await claim.json()) as { state: string; token?: string }
    expect(pending.state).toBe('claimed')
    expect(pending.token).toBeUndefined()

    // The writer sees the claim and approves it.
    const listed = (await (await page.request.get('/api/pair')).json()) as {
      pairings: Array<{ code: string; state: string }>
    }
    expect(listed.pairings).toContainEqual(
      expect.objectContaining({ code, state: 'claimed' }),
    )
    expect((await page.request.post(`/api/pair/${code}/approve`)).ok()).toBe(true)

    // Approval alone mints nothing: no token exists until the agent collects, so an
    // abandoned pairing cannot leave an orphan behind.
    const afterApproval = (await (await page.request.get('/api/tokens')).json()) as {
      tokens: Array<{ name: string }>
    }
    expect(afterApproval.tokens.filter((token) => token.name === 'paired agent')).toHaveLength(0)

    // The token arrives over the agent's own connection, and again if the first
    // collection is lost — an agent whose scratch directory is wiped needs that.
    const collected = await agent.post('/api/pair/claim', { data: { code } })
    expect(collected.ok()).toBe(true)
    const { token } = (await collected.json()) as { token: string }
    expect(token.startsWith('paddo_')).toBe(true)
    const again = await agent.post('/api/pair/claim', { data: { code } })
    expect(again.ok()).toBe(true)
    expect(((await again.json()) as { token: string }).token).toBe(token)

    // And it is the scoped token it was promised to be.
    const scoped = await request.newContext({
      baseURL,
      extraHTTPHeaders: { authorization: `Bearer ${token}` },
    })
    try {
      expect((await scoped.get(`/api/documents/${mine}`)).status()).toBe(200)
      expect((await scoped.get('/api/documents').then((r) => r.json())).documents).toHaveLength(1)
    } finally {
      await scoped.dispose()
    }
  } finally {
    await agent.dispose()
  }
})

test('an accepted change refuses the hunks whose range it overwrote', async ({ page }) => {
  await signIn(page)
  const slug = await createDocument(page, `Overlap ${Date.now()}`)
  await page.goto(`/d/${slug}`)
  await expect(page.locator('.prose h1')).toBeVisible()

  const sentence = 'a seam here in the text.'
  await page.locator('.prose p').last().click()
  await page.keyboard.type(sentence)
  await expect.poll(async () => (await readFile(`tests/fixtures/content/${slug}.md`, 'utf8')).includes(sentence)).toBe(true)

  // Two hunks on the same sentence, the second nested inside the first: applying the
  // first rewrites the text the second's anchors point into.
  const proposed = await page.request.post(`/api/documents/${slug}/suggestions`, {
    data: {
      edits: [
        { original: 'a seam here in the text.', proposed: 'A seam here in the text, tightened.' },
        { original: 'here in the text', proposed: 'here in the sentence' },
      ],
    },
  })
  expect(proposed.ok()).toBe(true)
  await expect(page.locator('.sug-hunk')).toHaveCount(2)

  // Accept the batch — the path that used to splice stale offsets.
  await page.getByRole('button', { name: 'Accept all' }).click()

  // The nested one cannot be applied any more: its quote now sits inside text the
  // agent never saw. It says so instead of splicing stale offsets.
  const inner = page.locator('.sug-hunk--conflict')
  await expect(inner).toHaveCount(1)
  await expect(inner.locator('.sug-conflict')).toContainText('Overlaps a change you already accepted')
  await expect(inner.locator('[data-sug-action="accept"]')).toBeDisabled()

  await expect.poll(async () => (await readFile(`tests/fixtures/content/${slug}.md`, 'utf8'))).toContain(
    'A seam here in the text, tightened.',
  )
  const body = await readFile(`tests/fixtures/content/${slug}.md`, 'utf8')
  expect(body).not.toContain('here in the sentence')
})

test('a renamed document still opens from its old address', async ({ page }) => {
  await signIn(page)
  const born = await createDocument(page, `Rename ${Date.now()}`)
  await page.goto(`/d/${born}`)
  await expect(page.locator('.prose h1')).toBeVisible()

  // Renaming happens when the last client leaves: the file takes its title.
  await page.locator('.prose h1').click()
  await page.keyboard.press('End')
  await page.keyboard.type(' and its title')
  await page.goto('/')
  await expect(page.locator('.documents')).toBeVisible()

  // The API follows the old name, so its answer is the name the document has now.
  let current = born
  for (let attempt = 0; attempt < 40 && current === born; attempt += 1) {
    const response = await page.request.get(`/api/documents/${born}`)
    if (response.ok()) current = ((await response.json()) as { slug: string }).slug
    else await page.waitForTimeout(250)
  }
  expect(current).not.toBe(born)

  // The address it was created under now redirects to the name it has.
  await page.goto(`/d/${born}`)
  await expect(page.locator('.prose h1')).toContainText('and its title')
  expect(page.url().endsWith(`/d/${current}`)).toBe(true)
})

test('an address with no document says so, and creates nothing', async ({ page }) => {
  await signIn(page)
  const ghost = `ghost-${Date.now()}`
  await page.goto(`/d/${ghost}`)
  await expect(page.getByRole('heading', { name: 'This document is gone' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'All documents' })).toBeVisible()

  // The connection is refused too, so nothing can write a file under that name.
  await page.waitForTimeout(1500)
  const response = await page.request.get(`/api/documents/${ghost}`)
  expect(response.status()).toBe(404)
})

test('an imported document keeps its raw HTML through an edit', async ({ page }) => {
  await signIn(page)

  // An import straight from a page pipeline: an HTML comment Paddō's schema cannot
  // hold as markup, and a bracket placeholder it would escape as a link.
  const created = await page.request.post('/api/documents', {
    data: {
      markdown:
        '<!-- page: keret.html\ntitle: Keret -->\n\nThe body starts here.\n\n[image: shot.jpg — a wall.]\n',
    },
  })
  expect(created.ok()).toBe(true)
  const { slug } = (await created.json()) as { slug: string }

  await page.goto(`/d/${slug}`)
  await page.locator('.prose h1, .prose p').first().waitFor()
  await page.waitForTimeout(1500)

  // A real edit, so the room stores and the file is written from the document.
  await page.locator('.prose p').last().click()
  await page.keyboard.press('End')
  await page.keyboard.type(' Edited.')

  await expect
    .poll(async () => (await readFile(`tests/fixtures/content/${slug}.md`, 'utf8').catch(() => '')).includes('Edited.'))
    .toBe(true)

  const file = await readFile(`tests/fixtures/content/${slug}.md`, 'utf8')
  // The comment stays a comment — it used to come back as `&lt;!-- … --&gt;`.
  expect(file).toContain('<!-- page: keret.html')
  expect(file).toContain('-->')
  expect(file).not.toContain('&lt;')
  // The bracket placeholder is still escaped in the file: markdown would read it as
  // a link, and the bake step on the other side unescapes it.
  expect(file).toContain('\\[image: shot.jpg')
})

test('opening a document leaves no transform above the editor', async ({ page }) => {
  await signIn(page)
  const slug = await createDocument(page, `Transform ${Date.now()}`)
  await page.goto(`/d/${slug}`)
  await expect(page.locator('.prose h1')).toBeVisible()

  // The entrance animation ends with a translate that fill-mode:both kept forever. A
  // composited transform above the editable area is what detached iOS Safari's
  // spellcheck underlines from the words while scrolling.
  await page.waitForTimeout(1500)
  const transforms = await page.evaluate(() => {
    const found: string[] = []
    let node = document.querySelector('.prose')
    while (node && node !== document.documentElement) {
      const style = getComputedStyle(node)
      if (style.transform !== 'none' || style.filter !== 'none' || style.willChange !== 'auto') {
        found.push(`${node.className || node.tagName}: ${style.transform}`)
      }
      node = node.parentElement
    }
    return found
  })
  expect(transforms).toEqual([])
})

test('the list shows how many edits are waiting on a document', async ({ page }) => {
  await signIn(page)
  const slug = await createDocument(page, `Waiting ${Date.now()}`)
  await page.goto(`/d/${slug}`)
  await expect(page.locator('.prose h1')).toBeVisible()

  const sentence = 'A sentence that will be edited twice over.'
  await page.locator('.prose p').last().click()
  await page.keyboard.type(sentence)
  await expect
    .poll(async () => (await readFile(`tests/fixtures/content/${slug}.md`, 'utf8').catch(() => '')).includes(sentence))
    .toBe(true)

  const proposed = await page.request.post(`/api/documents/${slug}/suggestions`, {
    data: {
      author: 'agent',
      edits: [
        { original: 'edited twice over.', proposed: 'edited twice.', rationale: 'tighten' },
        { original: 'A sentence that', proposed: 'One sentence that', rationale: 'start' },
      ],
    },
  })
  expect(proposed.ok()).toBe(true)

  // The count comes from the sidecar, not from an open room: the list never opened this one.
  await page.goto('/')
  const row = page.locator('.documents__item', { has: page.locator(`a[href="/d/${slug}"]`) })
  await expect(row.locator('.documents__pending')).toHaveText('2')

  // A document with nothing waiting carries no pill at all.
  const other = await createDocument(page, `Quiet ${Date.now()}`)
  await page.goto('/')
  const quiet = page.locator('.documents__item', { has: page.locator(`a[href="/d/${other}"]`) })
  await expect(quiet.locator('.documents__pending')).toHaveCount(0)
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
