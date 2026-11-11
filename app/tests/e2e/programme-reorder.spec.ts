import { expect, test } from '@playwright/test'
import { login } from './helpers/auth'

const MANAGER_EMAIL = process.env.E2E_PROGRAM_MANAGER_EMAIL
const MANAGER_PASSWORD = process.env.E2E_PROGRAM_MANAGER_PASSWORD
const REORDER_EVENT_ID = process.env.E2E_REORDER_EVENT_ID

// A fetcher posting to a route with a page goes to its `.data` URL.
const REORDER_PARTS_RE = /\/reorder-parts(\.data)?$/
const TEMPLATE_REORDER_URL_RE = /\/settings\/templates\/\d+\/reorder-parts(\.data)?$/
const EVENT_REORDER_URL_RE = /\/programs\/events\/\d+\/reorder-parts(\.data)?$/
const TEMPLATE_URL_RE = /\/settings\/templates\/\d+$/
const NOT_FOUND_RE = /404|page introuvable/i
const DRAGGABLE_RE = /draggable item (\d+)/i

test.describe('Programme parts drag-drop reorder (regression: #134)', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(
      !MANAGER_EMAIL || !MANAGER_PASSWORD,
      'needs E2E_PROGRAM_MANAGER_EMAIL/PASSWORD (role account not seeded in CI yet)',
    )
    const loggedIn = await login(page, MANAGER_EMAIL ?? '', MANAGER_PASSWORD ?? '')
    if (!loggedIn) test.skip()
  })

  test('template page POSTs to reorder-parts (no 404)', async ({ page }) => {
    await page.goto('/settings/templates')
    await page.waitForLoadState('networkidle')

    // A template opens as one page, its parts in the event editor's programme.
    const firstTemplateLink = page.locator('a[href^="/settings/templates/"]').first()
    if ((await firstTemplateLink.count()) === 0) test.skip()
    await firstTemplateLink.click()
    await expect(page).toHaveURL(TEMPLATE_URL_RE)

    const sortableRows = page.locator('[data-sortable]')
    await sortableRows
      .first()
      .waitFor({ timeout: 5000 })
      .catch(() => undefined)
    const rowsBefore = await sortableRows.allTextContents()
    if (rowsBefore.length < 2) test.skip()

    const responsePromise = page.waitForResponse(r => REORDER_PARTS_RE.test(r.url()) && r.request().method() === 'POST')

    const announcement = page.getByRole('status').filter({ hasText: DRAGGABLE_RE })
    await page.locator('button[aria-roledescription="sortable"]').first().focus()
    await page.keyboard.press('Space')
    await expect(announcement).toHaveText(DRAGGABLE_RE)
    const activeId = (await announcement.textContent())?.match(DRAGGABLE_RE)?.[1]
    await page.keyboard.press('ArrowDown')
    await expect(announcement).toHaveText(new RegExp(`over droppable area (?!${activeId}\\b)\\d+`))
    await page.keyboard.press('Space')

    const response = await responsePromise
    expect(response.ok()).toBeTruthy()
    expect(response.url()).toMatch(TEMPLATE_REORDER_URL_RE)

    await expect(page.getByText(NOT_FOUND_RE)).toHaveCount(0)

    await page.reload()
    const rowsAfter = await page.locator('[data-sortable]').allTextContents()
    expect(rowsAfter[0]).toBe(rowsBefore[1])
    expect(rowsAfter[1]).toBe(rowsBefore[0])
  })

  test('event edit POSTs to reorder-parts (no 404)', async ({ page }) => {
    test.skip(!REORDER_EVENT_ID, 'needs E2E_REORDER_EVENT_ID (event not seeded in CI yet)')
    await page.goto(`/programs/events/${REORDER_EVENT_ID}/edit`)
    await page.waitForLoadState('networkidle')

    const sortableRows = page.locator('[data-sortable]')
    const rowsBefore = await sortableRows.allTextContents()
    if (rowsBefore.length < 2) test.skip()

    const responsePromise = page.waitForResponse(r => REORDER_PARTS_RE.test(r.url()) && r.request().method() === 'POST')

    // dnd-kit announces each step of a keyboard drag in a live region (its default English wording): drop only once
    // it says the part is over another one, or Space lands before the move has registered.
    const announcement = page.getByRole('status').filter({ hasText: DRAGGABLE_RE })
    await page.locator('button[aria-roledescription="sortable"]').first().focus()
    await page.keyboard.press('Space')
    await expect(announcement).toHaveText(DRAGGABLE_RE)
    const activeId = (await announcement.textContent())?.match(DRAGGABLE_RE)?.[1]
    await page.keyboard.press('ArrowDown')
    await expect(announcement).toHaveText(new RegExp(`over droppable area (?!${activeId}\\b)\\d+`))
    await page.keyboard.press('Space')

    const response = await responsePromise
    expect(response.ok()).toBeTruthy()
    expect(response.url()).toMatch(EVENT_REORDER_URL_RE)

    await expect(page.getByText(NOT_FOUND_RE)).toHaveCount(0)

    await page.reload()
    const rowsAfter = await page.locator('[data-sortable]').allTextContents()
    expect(rowsAfter[0]).toBe(rowsBefore[1])
    expect(rowsAfter[1]).toBe(rowsBefore[0])
  })
})
