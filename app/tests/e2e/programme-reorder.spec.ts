import { expect, test } from '@playwright/test'
import { login } from './helpers/auth'

const MANAGER_EMAIL = process.env.E2E_PROGRAM_MANAGER_EMAIL
const MANAGER_PASSWORD = process.env.E2E_PROGRAM_MANAGER_PASSWORD
const REORDER_EVENT_ID = process.env.E2E_REORDER_EVENT_ID

const REORDER_PARTS_RE = /\/reorder-parts$/
const TEMPLATE_REORDER_URL_RE = /\/settings\/congregation\/templates\/\d+\/reorder-parts$/
const EVENT_REORDER_URL_RE = /\/programs\/events\/\d+\/reorder-parts$/
const TEMPLATE_EDIT_URL_RE = /\/settings\/congregation\/templates\/\d+\/edit/
const NOT_FOUND_RE = /404|page introuvable/i
const TEMPLATE_EDIT_LINK_RE = /modifier|edit/i

test.describe('Programme parts drag-drop reorder (regression: #134)', () => {
  test.beforeEach(async ({ page }) => {
    if (!MANAGER_EMAIL || !MANAGER_PASSWORD) test.skip()
    const loggedIn = await login(page, MANAGER_EMAIL ?? '', MANAGER_PASSWORD ?? '')
    if (!loggedIn) test.skip()
  })

  test('template edit POSTs to reorder-parts (no 404)', async ({ page }) => {
    await page.goto('/settings/congregation/templates')
    await page.waitForLoadState('networkidle')

    const firstTemplateLink = page.getByRole('link', { name: TEMPLATE_EDIT_LINK_RE }).first()
    if ((await firstTemplateLink.count()) === 0) test.skip()
    await firstTemplateLink.click()
    await expect(page).toHaveURL(TEMPLATE_EDIT_URL_RE)

    const sortableRows = page.locator('tbody tr[data-sortable]')
    const rowsBefore = await sortableRows.allTextContents()
    if (rowsBefore.length < 2) test.skip()

    const responsePromise = page.waitForResponse(r => REORDER_PARTS_RE.test(r.url()) && r.request().method() === 'POST')

    await page.locator('button[aria-roledescription="sortable"]').first().focus()
    await page.keyboard.press('Space')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Space')

    const response = await responsePromise
    expect(response.ok()).toBeTruthy()
    expect(response.url()).toMatch(TEMPLATE_REORDER_URL_RE)

    await expect(page.getByText(NOT_FOUND_RE)).toHaveCount(0)

    await page.reload()
    const rowsAfter = await page.locator('tbody tr[data-sortable]').allTextContents()
    expect(rowsAfter[0]).toBe(rowsBefore[1])
    expect(rowsAfter[1]).toBe(rowsBefore[0])
  })

  test('event edit POSTs to reorder-parts (no 404)', async ({ page }) => {
    if (!REORDER_EVENT_ID) test.skip()
    await page.goto(`/programs/events/${REORDER_EVENT_ID}/edit`)
    await page.waitForLoadState('networkidle')

    const sortableRows = page.locator('tbody tr[data-sortable]')
    const rowsBefore = await sortableRows.allTextContents()
    if (rowsBefore.length < 2) test.skip()

    const responsePromise = page.waitForResponse(r => REORDER_PARTS_RE.test(r.url()) && r.request().method() === 'POST')

    await page.locator('button[aria-roledescription="sortable"]').first().focus()
    await page.keyboard.press('Space')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Space')

    const response = await responsePromise
    expect(response.ok()).toBeTruthy()
    expect(response.url()).toMatch(EVENT_REORDER_URL_RE)

    await expect(page.getByText(NOT_FOUND_RE)).toHaveCount(0)

    await page.reload()
    const rowsAfter = await page.locator('tbody tr[data-sortable]').allTextContents()
    expect(rowsAfter[0]).toBe(rowsBefore[1])
    expect(rowsAfter[1]).toBe(rowsBefore[0])
  })
})
